// =============================================================================
// ZiraAI - Complete Analysis Worker with RabbitMQ Integration
// =============================================================================

import amqp, { Channel, Connection, ConsumeMessage } from 'amqplib';
import Redis from 'ioredis';
import pLimit from 'p-limit';
import OpenAIAnalysisProvider, { AnalysisRequest, AnalysisResponse } from './openai-analysis-provider';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface WorkerConfig {
  // Provider settings
  provider: 'openai' | 'gemini' | 'anthropic';
  apiKey: string;
  model: string;
  
  // Concurrency settings
  concurrency: number;        // Max concurrent analyses (e.g., 60)
  rateLimit: number;          // Max requests per minute (e.g., 350)
  
  // Queue settings
  rabbitmqUrl: string;
  inputQueue: string;         // e.g., "openai-analysis-queue"
  resultQueue: string;        // e.g., "analysis-results"
  dlqQueue: string;           // e.g., "analysis-dlq"
  
  // Redis settings
  redisUrl: string;
  
  // Retry settings
  maxRetries: number;         // e.g., 3
  retryDelayMs: number;       // e.g., 1000
}

// =============================================================================
// WORKER CLASS
// =============================================================================

class AnalysisWorker {
  private config: WorkerConfig;
  private redis: Redis;
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private limiter: pLimit.Limit;
  private provider: OpenAIAnalysisProvider;
  private isShuttingDown: boolean = false;
  private activeJobs: number = 0;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.redis = new Redis(config.redisUrl);
    this.limiter = pLimit(config.concurrency);
    this.provider = new OpenAIAnalysisProvider(config.apiKey, config.model);
    
    // Graceful shutdown handlers
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  // ===========================================================================
  // LIFECYCLE METHODS
  // ===========================================================================

  async start(): Promise<void> {
    console.log(`[Worker] Starting ${this.config.provider} worker...`);
    console.log(`[Worker] Concurrency: ${this.config.concurrency}`);
    console.log(`[Worker] Rate Limit: ${this.config.rateLimit}/min`);
    
    // Connect to RabbitMQ
    this.connection = await amqp.connect(this.config.rabbitmqUrl);
    this.channel = await this.connection.createChannel();
    
    // Set prefetch (concurrent message limit)
    await this.channel.prefetch(this.config.concurrency);
    
    // Assert queues exist
    await this.channel.assertQueue(this.config.inputQueue, { durable: true });
    await this.channel.assertQueue(this.config.resultQueue, { durable: true });
    await this.channel.assertQueue(this.config.dlqQueue, { durable: true });
    
    // Start consuming messages
    await this.channel.consume(
      this.config.inputQueue,
      (msg) => this.handleMessage(msg),
      { noAck: false }
    );
    
    console.log(`[Worker] Listening on queue: ${this.config.inputQueue}`);
    
    // Start health check reporting
    this.startHealthReporting();
  }

  async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    
    console.log('[Worker] Graceful shutdown initiated...');
    
    // Stop accepting new messages
    if (this.channel) {
      await this.channel.cancel(this.config.inputQueue);
    }
    
    // Wait for active jobs to complete (max 2 minutes)
    const maxWait = 120000;
    const startWait = Date.now();
    
    while (this.activeJobs > 0 && Date.now() - startWait < maxWait) {
      console.log(`[Worker] Waiting for ${this.activeJobs} active jobs...`);
      await this.sleep(5000);
    }
    
    // Close connections
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
    await this.redis.quit();
    
    console.log('[Worker] Shutdown complete');
    process.exit(0);
  }

  // ===========================================================================
  // MESSAGE HANDLING
  // ===========================================================================

  private async handleMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || this.isShuttingDown) return;
    
    // Use limiter for concurrency control
    this.limiter(async () => {
      this.activeJobs++;
      
      try {
        await this.processMessage(msg);
        this.channel!.ack(msg);
      } catch (error) {
        await this.handleError(msg, error as Error);
      } finally {
        this.activeJobs--;
        await this.updateActiveJobsMetric();
      }
    });
  }

  private async processMessage(msg: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    
    // Parse message
    const request: AnalysisRequest = JSON.parse(msg.content.toString());
    
    console.log(`[Worker] Processing analysis: ${request.analysis_id}`);
    
    // Wait for rate limit slot
    await this.waitForRateLimit();
    
    // Perform analysis
    const response = await this.provider.analyze(request);
    
    const totalTime = Date.now() - startTime;
    
    // Build result message
    const resultMessage = {
      // Original request data
      analysis_id: request.analysis_id,
      farmer_id: request.farmer_id,
      sponsor_id: request.sponsor_id,
      location: request.location,
      crop_type: request.crop_type,
      
      // Analysis result
      ...response.result,
      
      // Processing metadata
      processing_metadata: {
        provider: this.config.provider,
        model: response.model,
        processing_time_ms: totalTime,
        ai_processing_time_ms: response.processing_time_ms,
        completed_at: new Date().toISOString(),
        token_usage: response.token_usage
      },
      
      // Preserve original metadata
      image_metadata: request.image_metadata,
      rabbitmq_metadata: {
        original_queue: this.config.inputQueue,
        response_queue: this.config.resultQueue
      }
    };
    
    // Send to result queue
    this.channel!.sendToQueue(
      this.config.resultQueue,
      Buffer.from(JSON.stringify(resultMessage)),
      { persistent: true }
    );
    
    // Record success metrics
    await this.recordSuccess(totalTime, response.token_usage.total_tokens);
    
    console.log(`[Worker] Analysis completed: ${request.analysis_id} (${totalTime}ms)`);
  }

  // ===========================================================================
  // RATE LIMITING
  // ===========================================================================

  private async waitForRateLimit(): Promise<void> {
    const maxWaitMs = 30000; // Max 30 seconds wait
    const startWait = Date.now();
    
    while (Date.now() - startWait < maxWaitMs) {
      const window = Math.floor(Date.now() / 60000); // 1-minute window
      const rateKey = `rate:${this.config.provider}:${window}`;
      
      // Try to increment counter
      const current = await this.redis.incr(rateKey);
      await this.redis.expire(rateKey, 120); // 2 minute TTL
      
      if (current <= this.config.rateLimit) {
        // Got a slot!
        return;
      }
      
      // Rollback increment and wait
      await this.redis.decr(rateKey);
      
      // Wait a bit before retrying
      await this.sleep(100 + Math.random() * 100); // 100-200ms with jitter
    }
    
    throw new Error('Rate limit wait timeout');
  }

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================

  private async handleError(msg: ConsumeMessage, error: Error): Promise<void> {
    const request: AnalysisRequest = JSON.parse(msg.content.toString());
    const retryCount = request._retryCount || 0;
    
    console.error(`[Worker] Error processing ${request.analysis_id}:`, error.message);
    
    // Record error metric
    await this.recordError();
    
    if (retryCount < this.config.maxRetries) {
      // Retry with exponential backoff
      const delay = this.config.retryDelayMs * Math.pow(2, retryCount);
      
      console.log(`[Worker] Retrying ${request.analysis_id} in ${delay}ms (attempt ${retryCount + 1})`);
      
      setTimeout(() => {
        this.channel!.sendToQueue(
          this.config.inputQueue,
          Buffer.from(JSON.stringify({
            ...request,
            _retryCount: retryCount + 1,
            _lastError: error.message,
            _lastRetryAt: new Date().toISOString()
          })),
          { persistent: true }
        );
      }, delay);
      
      this.channel!.ack(msg);
    } else {
      // Send to DLQ
      console.log(`[Worker] Sending ${request.analysis_id} to DLQ after ${retryCount} retries`);
      
      this.channel!.sendToQueue(
        this.config.dlqQueue,
        Buffer.from(JSON.stringify({
          ...request,
          _error: error.message,
          _errorStack: error.stack,
          _failedAt: new Date().toISOString(),
          _totalRetries: retryCount,
          _provider: this.config.provider
        })),
        { persistent: true }
      );
      
      this.channel!.ack(msg);
    }
  }

  // ===========================================================================
  // METRICS & HEALTH
  // ===========================================================================

  private async recordSuccess(processingTimeMs: number, tokens: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    pipeline.hincrby('metrics:success', this.config.provider, 1);
    pipeline.hincrby('metrics:tokens', this.config.provider, tokens);
    pipeline.hset('metrics:last_success', this.config.provider, Date.now().toString());
    
    // Update running average of processing time
    pipeline.lpush(`metrics:latency:${this.config.provider}`, processingTimeMs.toString());
    pipeline.ltrim(`metrics:latency:${this.config.provider}`, 0, 99); // Keep last 100
    
    await pipeline.exec();
  }

  private async recordError(): Promise<void> {
    const window = Math.floor(Date.now() / 60000);
    const errorKey = `errors:${this.config.provider}:${window}`;
    
    const errorCount = await this.redis.incr(errorKey);
    await this.redis.expire(errorKey, 120);
    
    // Check circuit breaker threshold
    if (errorCount >= 5) {
      console.warn(`[Worker] Circuit breaker threshold reached for ${this.config.provider}`);
      await this.redis.set(`health:${this.config.provider}`, 'degraded', 'EX', 60);
    }
    
    await this.redis.hincrby('metrics:errors', this.config.provider, 1);
  }

  private async updateActiveJobsMetric(): Promise<void> {
    await this.redis.set(
      `worker:${process.env.RAILWAY_REPLICA_ID || 'local'}:active_jobs`,
      this.activeJobs.toString()
    );
  }

  private startHealthReporting(): void {
    // Report health every 30 seconds
    setInterval(async () => {
      if (this.isShuttingDown) return;
      
      const workerId = process.env.RAILWAY_REPLICA_ID || 'local';
      
      await this.redis.hset('workers:health', workerId, JSON.stringify({
        provider: this.config.provider,
        activeJobs: this.activeJobs,
        lastHeartbeat: new Date().toISOString(),
        status: 'healthy'
      }));
      
      // Set health status to OK if no errors
      const window = Math.floor(Date.now() / 60000);
      const errorCount = parseInt(await this.redis.get(`errors:${this.config.provider}:${window}`) || '0');
      
      if (errorCount < 5) {
        await this.redis.set(`health:${this.config.provider}`, 'ok');
      }
    }, 30000);
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

async function main(): Promise<void> {
  // Load configuration from environment variables
  const config: WorkerConfig = {
    provider: (process.env.PROVIDER as 'openai' | 'gemini' | 'anthropic') || 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.MODEL || 'gpt-5-mini',
    
    concurrency: parseInt(process.env.CONCURRENCY || '60'),
    rateLimit: parseInt(process.env.RATE_LIMIT || '350'),
    
    rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    inputQueue: process.env.QUEUE_NAME || 'openai-analysis-queue',
    resultQueue: process.env.RESULT_QUEUE || 'analysis-results',
    dlqQueue: process.env.DLQ_QUEUE || 'analysis-dlq',
    
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    
    maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000')
  };

  // Validate required config
  if (!config.apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  if (!config.rabbitmqUrl) {
    throw new Error('RABBITMQ_URL environment variable is required');
  }
  if (!config.redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  // Create and start worker
  const worker = new AnalysisWorker(config);
  await worker.start();
  
  console.log('[Main] Worker started successfully');
}

// Run
main().catch((error) => {
  console.error('[Main] Fatal error:', error);
  process.exit(1);
});

export { AnalysisWorker, WorkerConfig };
