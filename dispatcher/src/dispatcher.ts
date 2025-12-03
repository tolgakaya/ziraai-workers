/**
 * ZiraAI Dispatcher Service
 * Routes raw analysis requests to provider-specific queues
 */

import amqp, { Channel, Connection } from 'amqplib';
import { DispatcherConfig, AnalysisRequest, ProviderType } from './types/config';
import { RateLimiterService } from './services/rate-limiter.service';

export class Dispatcher {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private config: DispatcherConfig;
  private roundRobinIndex: number = 0;
  private availableProviders: ProviderType[];
  private rateLimiter: RateLimiterService | null = null;

  constructor(config: DispatcherConfig) {
    this.config = config;

    // Initialize available providers list
    this.availableProviders = config.dispatcher.availableProviders || ['openai', 'gemini', 'anthropic'];

    // Initialize rate limiter if enabled
    if (config.rateLimit.enabled) {
      this.rateLimiter = new RateLimiterService(config.redis, console);
      console.log(`[Dispatcher ${this.config.dispatcher.id}] Rate limiting enabled (delay: ${config.rateLimit.delayMs}ms)`);
    } else {
      console.log(`[Dispatcher ${this.config.dispatcher.id}] Rate limiting disabled`);
    }

    console.log(`[Dispatcher ${this.config.dispatcher.id}] Available providers:`, this.availableProviders);
  }

  /**
   * Connect to RabbitMQ and setup channels
   */
  async connect(): Promise<void> {
    try {
      console.log(`[Dispatcher ${this.config.dispatcher.id}] Connecting to RabbitMQ...`);

      const conn = await amqp.connect(this.config.rabbitmq.url) as unknown as Connection;
      this.connection = conn;
      const ch = await (conn as any).createChannel() as Channel;
      this.channel = ch;

      // Assert all queues exist with TTL (24 hours = 86400000ms)
      const queueOptions = {
        durable: true,
        arguments: { 'x-message-ttl': 86400000 } // 24 hours message TTL
      };

      await ch.assertQueue(this.config.rabbitmq.queues.rawAnalysis, queueOptions);
      await ch.assertQueue(this.config.rabbitmq.queues.openai, queueOptions);
      await ch.assertQueue(this.config.rabbitmq.queues.gemini, queueOptions);
      await ch.assertQueue(this.config.rabbitmq.queues.anthropic, queueOptions);
      await ch.assertQueue(this.config.rabbitmq.queues.dlq, queueOptions);

      console.log(`[Dispatcher ${this.config.dispatcher.id}] Connected to RabbitMQ`);
      console.log(`[Dispatcher ${this.config.dispatcher.id}] Strategy: ${this.config.dispatcher.strategy}`);

      if (this.config.dispatcher.strategy === 'FIXED') {
        console.log(`[Dispatcher ${this.config.dispatcher.id}] Fixed Provider: ${this.config.dispatcher.fixedProvider}`);
      }
    } catch (error) {
      console.error(`[Dispatcher ${this.config.dispatcher.id}] Connection failed:`, error);
      throw error;
    }
  }

  /**
   * Start consuming from raw-analysis-queue
   */
  async startConsuming(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized. Call connect() first.');
    }

    const queueName = this.config.rabbitmq.queues.rawAnalysis;

    console.log(`[Dispatcher ${this.config.dispatcher.id}] Starting to consume from ${queueName}...`);

    await this.channel.consume(
      queueName,
      async (msg) => {
        if (!msg) return;

        try {
          const request: AnalysisRequest = JSON.parse(msg.content.toString());

          console.log(`[Dispatcher ${this.config.dispatcher.id}] Received request: ${request.AnalysisId || 'unknown'}`);

          // Route to provider-specific queue based on strategy
          const targetQueue = this.selectProviderQueue(request);

          await this.routeToQueue(targetQueue, request);

          // Acknowledge the message
          this.channel!.ack(msg);

          console.log(`[Dispatcher ${this.config.dispatcher.id}] Routed ${request.AnalysisId} to ${targetQueue}`);
        } catch (error) {
          console.error(`[Dispatcher ${this.config.dispatcher.id}] Error processing message:`, error);

          // Send to DLQ
          if (this.channel) {
            await this.channel.sendToQueue(
              this.config.rabbitmq.queues.dlq,
              msg.content,
              { persistent: true }
            );
            this.channel.ack(msg);
          }
        }
      },
      { noAck: false }
    );

    console.log(`[Dispatcher ${this.config.dispatcher.id}] Consuming from ${queueName}`);
  }

  /**
   * Select provider queue based on strategy
   */
  private selectProviderQueue(request: AnalysisRequest): string {
    switch (this.config.dispatcher.strategy) {
      case 'FIXED':
        return this.selectProviderQueue_Fixed();

      case 'ROUND_ROBIN':
        return this.selectProviderQueue_RoundRobin();

      case 'COST_OPTIMIZED':
        return this.selectProviderQueue_CostOptimized();

      case 'QUALITY_FIRST':
        return this.selectProviderQueue_QualityFirst();

      case 'WEIGHTED':
        return this.selectProviderQueue_Weighted();

      case 'MESSAGE_BASED':
        return this.selectProviderQueue_MessageBased(request);

      default:
        console.warn(`[Dispatcher ${this.config.dispatcher.id}] Unknown strategy ${this.config.dispatcher.strategy}, defaulting to openai`);
        return this.config.rabbitmq.queues.openai;
    }
  }

  /**
   * FIXED Strategy: Always route to the configured provider
   */
  private selectProviderQueue_Fixed(): string {
    const provider = this.config.dispatcher.fixedProvider || 'openai';
    return this.getQueueForProvider(provider);
  }

  /**
   * ROUND_ROBIN Strategy: Distribute evenly across all available providers
   */
  private selectProviderQueue_RoundRobin(): string {
    if (this.availableProviders.length === 0) {
      console.warn(`[Dispatcher ${this.config.dispatcher.id}] No available providers, defaulting to openai`);
      return this.config.rabbitmq.queues.openai;
    }

    const provider = this.availableProviders[this.roundRobinIndex];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.availableProviders.length;

    console.log(`[Dispatcher ${this.config.dispatcher.id}] ROUND_ROBIN selected: ${provider} (next index: ${this.roundRobinIndex})`);
    return this.getQueueForProvider(provider);
  }

  /**
   * COST_OPTIMIZED Strategy: Route to providers in priority order
   * Priority determined by PROVIDER_PRIORITY_ORDER environment variable
   * Default order: gemini → openai → anthropic (cheapest to most expensive)
   */
  private selectProviderQueue_CostOptimized(): string {
    // Use configured priority order, or fallback to default cost-based ranking
    const priorityOrder = this.config.dispatcher.priorityOrder || ['gemini', 'openai', 'anthropic'];

    // Select first available provider from priority order
    for (const provider of priorityOrder) {
      if (this.availableProviders.includes(provider)) {
        console.log(`[Dispatcher ${this.config.dispatcher.id}] COST_OPTIMIZED selected: ${provider} (priority order)`);
        return this.getQueueForProvider(provider);
      }
    }

    // Fallback if no provider from priority order is available
    console.warn(`[Dispatcher ${this.config.dispatcher.id}] No available providers in priority order, defaulting to openai`);
    return this.config.rabbitmq.queues.openai;
  }

  /**
   * QUALITY_FIRST Strategy: Route to providers in priority order
   * Priority determined by PROVIDER_PRIORITY_ORDER environment variable
   * Default order: anthropic → openai → gemini (highest to lowest quality)
   */
  private selectProviderQueue_QualityFirst(): string {
    // Use configured priority order, or fallback to default quality-based ranking
    const priorityOrder = this.config.dispatcher.priorityOrder || ['anthropic', 'openai', 'gemini'];

    // Select first available provider from priority order
    for (const provider of priorityOrder) {
      if (this.availableProviders.includes(provider)) {
        console.log(`[Dispatcher ${this.config.dispatcher.id}] QUALITY_FIRST selected: ${provider} (priority order)`);
        return this.getQueueForProvider(provider);
      }
    }

    // Fallback if no provider from priority order is available
    console.warn(`[Dispatcher ${this.config.dispatcher.id}] No available providers in priority order, defaulting to openai`);
    return this.config.rabbitmq.queues.openai;
  }

  /**
   * WEIGHTED Strategy: Distribute based on configured percentage weights
   * Example: { openai: 50%, gemini: 30%, anthropic: 20% }
   */
  private selectProviderQueue_Weighted(): string {
    const weights = this.config.dispatcher.weights;

    if (!weights || weights.length === 0) {
      console.warn(`[Dispatcher ${this.config.dispatcher.id}] No weights configured for WEIGHTED strategy, defaulting to openai`);
      return this.config.rabbitmq.queues.openai;
    }

    // Calculate total weight
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

    if (totalWeight === 0) {
      console.warn(`[Dispatcher ${this.config.dispatcher.id}] Total weight is 0, defaulting to openai`);
      return this.config.rabbitmq.queues.openai;
    }

    // Generate random number between 0 and totalWeight
    const random = Math.random() * totalWeight;

    // Select provider based on weighted random selection
    let cumulative = 0;
    for (const weightConfig of weights) {
      cumulative += weightConfig.weight;
      if (random <= cumulative) {
        console.log(`[Dispatcher ${this.config.dispatcher.id}] WEIGHTED selected: ${weightConfig.provider} (random: ${random.toFixed(2)}, cumulative: ${cumulative})`);
        return this.getQueueForProvider(weightConfig.provider);
      }
    }

    // Fallback (should never reach here)
    console.warn(`[Dispatcher ${this.config.dispatcher.id}] WEIGHTED selection failed, defaulting to first weight`);
    return this.getQueueForProvider(weights[0].provider);
  }

  /**
   * MESSAGE_BASED Strategy: Use provider specified in request message
   * Legacy n8n compatibility - reads 'provider' field from request
   */
  private selectProviderQueue_MessageBased(request: AnalysisRequest): string {
    const requestedProvider = request.provider?.toLowerCase();

    if (!requestedProvider) {
      console.warn(`[Dispatcher ${this.config.dispatcher.id}] MESSAGE_BASED: No provider in request, defaulting to openai`);
      return this.config.rabbitmq.queues.openai;
    }

    // Validate provider
    const validProviders: ProviderType[] = ['openai', 'gemini', 'anthropic'];
    if (!validProviders.includes(requestedProvider as ProviderType)) {
      console.warn(`[Dispatcher ${this.config.dispatcher.id}] MESSAGE_BASED: Invalid provider '${requestedProvider}', defaulting to openai`);
      return this.config.rabbitmq.queues.openai;
    }

    console.log(`[Dispatcher ${this.config.dispatcher.id}] MESSAGE_BASED selected: ${requestedProvider} (from request)`);
    return this.getQueueForProvider(requestedProvider as ProviderType);
  }

  /**
   * Helper: Get queue name for a given provider
   */
  private getQueueForProvider(provider: ProviderType): string {
    switch (provider) {
      case 'openai':
        return this.config.rabbitmq.queues.openai;
      case 'gemini':
        return this.config.rabbitmq.queues.gemini;
      case 'anthropic':
        return this.config.rabbitmq.queues.anthropic;
      default:
        console.warn(`[Dispatcher ${this.config.dispatcher.id}] Unknown provider ${provider}, defaulting to openai`);
        return this.config.rabbitmq.queues.openai;
    }
  }

  /**
   * Route request to target provider queue WITH rate limit check
   */
  private async routeToQueue(queueName: string, request: AnalysisRequest): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // Extract provider from queue name
    const provider = this.extractProviderFromQueue(queueName);

    // ============================================
    // DISPATCHER RATE LIMIT CHECK
    // ============================================
    if (this.rateLimiter && this.config.rateLimit.enabled) {
      const rateLimit = this.getProviderRateLimit(provider);
      const rateLimitAllowed = await this.rateLimiter.checkRateLimit(provider, rateLimit);

      if (!rateLimitAllowed) {
        // Rate limit exceeded - route to delayed queue
        console.warn(
          `[Dispatcher ${this.config.dispatcher.id}] Rate limit exceeded for ${provider}, ` +
          `routing to delayed queue (${this.config.rateLimit.delayMs}ms)`
        );

        await this.routeToDelayedQueue(queueName, request, this.config.rateLimit.delayMs);
        return;
      }
    }

    // Rate limit OK - route to normal queue
    const message = Buffer.from(JSON.stringify(request));

    this.channel.sendToQueue(queueName, message, {
      persistent: true,
      contentType: 'application/json'
    });

    console.log(
      `[Dispatcher ${this.config.dispatcher.id}] Routed ${request.AnalysisId} to ${queueName} ` +
      `(rate limit OK: ${provider})`
    );
  }

  /**
   * Route to delayed queue using TTL + DLX pattern
   * RabbitMQ will automatically route message to target queue after delay
   */
  private async routeToDelayedQueue(
    targetQueue: string,
    request: AnalysisRequest,
    delayMs: number
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // Delayed queue name pattern: "gemini-analysis-queue-delayed-30000ms"
    const delayedQueueName = `${targetQueue}-delayed-${delayMs}ms`;

    // Assert delayed queue with DLX configuration
    await this.channel.assertQueue(delayedQueueName, {
      durable: true,
      arguments: {
        'x-message-ttl': delayMs,  // Message expires after delayMs
        'x-dead-letter-exchange': '',  // Use default exchange
        'x-dead-letter-routing-key': targetQueue,  // Route to target queue on expiry
      }
    });

    const message = Buffer.from(JSON.stringify(request));

    this.channel.sendToQueue(delayedQueueName, message, {
      persistent: true,
      contentType: 'application/json'
    });

    console.log(
      `[Dispatcher ${this.config.dispatcher.id}] Routed ${request.AnalysisId} to delayed queue ` +
      `(${delayedQueueName} → ${targetQueue} after ${delayMs}ms)`
    );
  }

  /**
   * Extract provider name from queue name
   */
  private extractProviderFromQueue(queueName: string): ProviderType {
    if (queueName.includes('gemini')) return 'gemini';
    if (queueName.includes('openai')) return 'openai';
    if (queueName.includes('anthropic')) return 'anthropic';

    // Fallback
    console.warn(`[Dispatcher ${this.config.dispatcher.id}] Unknown queue name: ${queueName}, defaulting to openai`);
    return 'openai';
  }

  /**
   * Get rate limit for provider from environment variables
   */
  private getProviderRateLimit(provider: ProviderType): number {
    const limits: Record<ProviderType, number> = {
      'gemini': parseInt(process.env.GEMINI_RATE_LIMIT || '500'),
      'openai': parseInt(process.env.OPENAI_RATE_LIMIT || '5000'),
      'anthropic': parseInt(process.env.ANTHROPIC_RATE_LIMIT || '400'),
    };

    return limits[provider] || 1000;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log(`[Dispatcher ${this.config.dispatcher.id}] Shutting down...`);

    // Close rate limiter
    if (this.rateLimiter) {
      await this.rateLimiter.close();
    }

    if (this.channel) {
      await (this.channel as any).close();
    }

    if (this.connection) {
      await (this.connection as any).close();
    }

    console.log(`[Dispatcher ${this.config.dispatcher.id}] Shutdown complete`);
  }
}
