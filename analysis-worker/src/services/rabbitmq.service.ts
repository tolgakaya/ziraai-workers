import amqp, { Channel, Connection } from 'amqplib';
import { RabbitMQConfig } from '../types/config';
import { PlantAnalysisAsyncRequestDto, PlantAnalysisAsyncResponseDto } from '../types/messages';
import { Logger } from 'pino';

/**
 * RabbitMQ service for consuming and publishing messages
 * Handles queue operations with automatic reconnection
 */
export class RabbitMQService {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private config: RabbitMQConfig;
  private logger: Logger;
  private reconnecting: boolean = false;

  constructor(config: RabbitMQConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Connect to RabbitMQ and create channel
   */
  async connect(): Promise<void> {
    try {
      this.logger.info({ url: this.maskUrl(this.config.url) }, 'Connecting to RabbitMQ');

      const conn = await amqp.connect(this.config.url) as unknown as Connection;
      this.connection = conn;

      conn.on('error', (error) => {
        this.logger.error({ error }, 'RabbitMQ connection error');
        this.reconnect();
      });

      conn.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.reconnect();
      });

      const ch = await (conn as any).createChannel();
      this.channel = ch;

      ch.on('error', (error: Error) => {
        this.logger.error({ error }, 'RabbitMQ channel error');
      });

      ch.on('close', () => {
        this.logger.warn('RabbitMQ channel closed');
      });

      // Set prefetch count for fair distribution
      await ch.prefetch(this.config.prefetchCount);

      // Assert queues exist
      await this.assertQueues();

      this.logger.info('RabbitMQ connected successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to connect to RabbitMQ');
      throw error;
    }
  }

  /**
   * Assert that required queues exist with correct TTL configuration
   * IMPORTANT: Only assert queues that this worker OWNS (creates and publishes to)
   * Do NOT assert WebAPI queues (plant-analysis-requests, plant-analysis-multi-image-requests)
   * Those queues are managed by WebAPI/Dispatcher and have no TTL
   */
  private async assertQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // ONLY assert queues that this worker creates/owns
    // These queues have 24h TTL for automatic cleanup
    const ownedQueues = [
      this.config.queues.results,           // plant-analysis-results (worker publishes here)
      this.config.queues.dlq,              // analysis-dlq (worker may send failed messages here)
    ];

    for (const queue of ownedQueues) {
      try {
        // Worker-owned queues always have 24h TTL
        await this.channel.assertQueue(queue, {
          durable: true,
          arguments: {
            'x-message-ttl': 86400000, // 24 hours
          },
        });
        this.logger.info({ queue }, 'Worker queue ready (created or already exists with TTL)');
      } catch (error: any) {
        // PRECONDITION_FAILED means queue exists with different parameters
        // In this case, we'll use the existing queue (graceful degradation)
        if (error.message && error.message.includes('PRECONDITION_FAILED')) {
          this.logger.warn(
            { queue, error: error.message },
            'Queue exists with different configuration - using existing queue'
          );

          // CRITICAL: RabbitMQ closes the channel after PRECONDITION_FAILED
          // We need to recreate the channel to continue operations
          if (this.connection) {
            this.channel = await (this.connection as any).createChannel();
            if (!this.channel) {
              throw new Error('Failed to recreate channel after PRECONDITION_FAILED');
            }
            await this.channel.prefetch(this.config.prefetchCount);
            this.logger.info('Channel recreated after PRECONDITION_FAILED');
          } else {
            throw new Error('Connection is null, cannot recreate channel');
          }
        } else {
          // Different error, rethrow
          this.logger.error({ queue, error }, 'Failed to assert queue');
          throw error;
        }
      }
    }
  }

  /**
   * Consume messages from a queue (WebAPI plant-analysis-requests queue)
   *
   * @param queueName - Queue to consume from (e.g., 'plant-analysis-requests')
   * @param handler - Message handler function
   */
  async consumeQueue(
    queueName: string,
    handler: (message: PlantAnalysisAsyncRequestDto) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    this.logger.info({ queueName }, 'Starting consumer');

    await this.channel.consume(
      queueName,
      async (msg) => {
        if (!msg) {
          return;
        }

        try {
          const message: PlantAnalysisAsyncRequestDto = JSON.parse(msg.content.toString());

          this.logger.debug({
            analysisId: message.AnalysisId,
            farmerId: message.FarmerId,
            queueName,
          }, 'Message received from WebAPI');

          // Process the message
          await handler(message);

          // Acknowledge message
          this.channel?.ack(msg);

          this.logger.debug({
            analysisId: message.AnalysisId,
            queueName,
          }, 'Message acknowledged');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // ============================================
          // SMART NACK STRATEGY
          // ============================================
          // Rate limit errors: NACK with requeue=true (automatic redelivery)
          // Other errors: NACK with requeue=false (send to DLQ)

          if (errorMessage === 'RATE_LIMIT_EXCEEDED_AT_WORKER') {
            // Rate limit exceeded - requeue for automatic retry
            this.logger.warn({
              analysisId: (JSON.parse(msg.content.toString()) as PlantAnalysisAsyncRequestDto).AnalysisId,
              queueName,
              messageId: msg.properties.messageId,
            }, 'Rate limit exceeded - requeuing message');

            this.channel?.nack(msg, false, true); // requeue=true
          } else {
            // Other errors - send to DLQ
            this.logger.error({
              error,
              queueName,
              messageId: msg.properties.messageId,
            }, 'Message processing failed - sending to DLQ');

            this.channel?.nack(msg, false, false); // requeue=false (DLQ)
          }
        }
      },
      {
        noAck: false, // Manual acknowledgment
      }
    );
  }

  /**
   * Publish analysis result to results queue
   * Uses response_queue from result if available, otherwise falls back to default
   */
  async publishResult(result: PlantAnalysisAsyncResponseDto): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    try {
      // CRITICAL: Use response_queue from result if available (for multi-image support)
      // Otherwise fall back to default results queue
      const targetQueue = result.response_queue || this.config.queues.results;

      const message = JSON.stringify(result);

      const published = this.channel.publish(
        '', // Default exchange
        targetQueue,
        Buffer.from(message),
        {
          persistent: true, // Persist message to disk
          contentType: 'application/json',
          timestamp: Date.now(),
          messageId: `${result.analysis_id}-${Date.now()}`,
        }
      );

      if (!published) {
        this.logger.warn({
          analysisId: result.analysis_id,
          queue: targetQueue,
          responseQueue: result.response_queue,
        }, 'Message buffered (channel full)');
      } else {
        this.logger.info({
          analysisId: result.analysis_id,
          queue: targetQueue,
          responseQueue: result.response_queue,
          usedFallback: !result.response_queue,
        }, 'Result published to PlantAnalysisWorkerService');
      }
    } catch (error) {
      this.logger.error({
        error,
        analysisId: result.analysis_id,
        responseQueue: result.response_queue,
      }, 'Failed to publish result');
      throw error;
    }
  }

  /**
   * Get queue depth (number of messages waiting)
   */
  async getQueueDepth(queueName: string): Promise<number> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    try {
      const queueInfo = await this.channel.checkQueue(queueName);
      return queueInfo.messageCount;
    } catch (error) {
      this.logger.error({ error, queueName }, 'Failed to get queue depth');
      return 0;
    }
  }

  /**
   * Reconnect to RabbitMQ after connection loss
   */
  private async reconnect(): Promise<void> {
    if (this.reconnecting) {
      return;
    }

    this.reconnecting = true;

    this.logger.info('Attempting to reconnect to RabbitMQ');

    await new Promise(resolve => setTimeout(resolve, this.config.reconnectDelay));

    try {
      await this.connect();
      this.reconnecting = false;
    } catch (error) {
      this.logger.error({ error }, 'Reconnection failed, will retry');
      this.reconnecting = false;
      this.reconnect();
    }
  }

  /**
   * Close connection gracefully
   */
  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }

      if (this.connection) {
        await (this.connection as any).close();
      }

      this.logger.info('RabbitMQ connection closed gracefully');
    } catch (error) {
      this.logger.error({ error }, 'Error closing RabbitMQ connection');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.channel) {
        return false;
      }

      // Try to check a queue
      await this.channel.checkQueue(this.config.queues.results);
      return true;
    } catch (error) {
      this.logger.error({ error }, 'RabbitMQ health check failed');
      return false;
    }
  }

  /**
   * Mask sensitive URL information for logging
   */
  private maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.password) {
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return '***';
    }
  }
}
