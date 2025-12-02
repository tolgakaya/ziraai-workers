/**
 * ZiraAI Dispatcher Service
 * Routes raw analysis requests to provider-specific queues
 */

import amqp, { Channel, Connection } from 'amqplib';
import { DispatcherConfig, AnalysisRequest } from './types/config';

export class Dispatcher {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private config: DispatcherConfig;

  constructor(config: DispatcherConfig) {
    this.config = config;
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
   * Phase 1: FIXED strategy (always route to configured provider)
   */
  private selectProviderQueue(request: AnalysisRequest): string {
    switch (this.config.dispatcher.strategy) {
      case 'FIXED':
        // FIXED strategy: Always route to the configured provider
        const provider = this.config.dispatcher.fixedProvider || 'openai';

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

      case 'ROUND_ROBIN':
      case 'COST_OPTIMIZED':
      case 'LATENCY_OPTIMIZED':
        // Future implementation
        console.log(`[Dispatcher ${this.config.dispatcher.id}] Strategy ${this.config.dispatcher.strategy} not implemented yet, using FIXED`);
        return this.config.rabbitmq.queues.openai;

      default:
        console.warn(`[Dispatcher ${this.config.dispatcher.id}] Unknown strategy ${this.config.dispatcher.strategy}, defaulting to openai`);
        return this.config.rabbitmq.queues.openai;
    }
  }

  /**
   * Route request to target provider queue
   */
  private async routeToQueue(queueName: string, request: AnalysisRequest): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const message = Buffer.from(JSON.stringify(request));

    this.channel.sendToQueue(queueName, message, {
      persistent: true,
      contentType: 'application/json'
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log(`[Dispatcher ${this.config.dispatcher.id}] Shutting down...`);

    if (this.channel) {
      await (this.channel as any).close();
    }

    if (this.connection) {
      await (this.connection as any).close();
    }

    console.log(`[Dispatcher ${this.config.dispatcher.id}] Shutdown complete`);
  }
}
