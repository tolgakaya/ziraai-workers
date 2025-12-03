import Redis from 'ioredis';
import { RedisConfig } from '../types/config';

export interface RateLimitState {
  provider: string;
  currentCount: number;
  limit: number;
  windowStart: number;
  windowDuration: number;
  allowed: boolean;
}

/**
 * Redis-based rate limiter with sliding window algorithm
 * Provides centralized rate limiting across multiple dispatcher instances
 */
export class RateLimiterService {
  private redis: Redis;
  private config: RedisConfig;
  private logger: any;

  constructor(config: RedisConfig, logger: any) {
    this.config = config;
    this.logger = logger;
    this.redis = new Redis(config.url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('error', (error: Error) => {
      this.logger.error({ error }, 'Redis connection error');
    });

    this.redis.on('connect', () => {
      this.logger.info('Redis connected successfully');
    });
  }

  /**
   * Check if a request is allowed under the rate limit
   * Uses sliding window algorithm for accurate rate limiting
   *
   * @param provider - Provider name (e.g., 'openai', 'gemini', 'anthropic')
   * @param limit - Maximum requests per minute
   * @returns true if request is allowed, false if rate limit exceeded
   */
  async checkRateLimit(provider: string, limit: number): Promise<boolean> {
    const key = `${this.config.keyPrefix}${provider}`;
    const now = Date.now();
    const windowStart = now - 60000; // 60 seconds window

    try {
      // First, check current count without modifying
      await this.redis.zremrangebyscore(key, '-inf', windowStart);
      const currentCount = await this.redis.zcard(key);

      const allowed = currentCount < limit;

      if (allowed) {
        // Only add to Redis if allowed
        const pipeline = this.redis.pipeline();
        pipeline.zadd(key, now, `${now}-${Math.random()}`);
        pipeline.expire(key, this.config.ttl);
        await pipeline.exec();
      } else {
        this.logger.warn({
          provider,
          currentCount,
          limit,
          key,
        }, 'Rate limit exceeded');
      }

      return allowed;
    } catch (error) {
      this.logger.error({
        error,
        provider,
        limit,
      }, 'Rate limit check failed');

      // Fail open: Allow request if Redis is unavailable
      // This prevents Redis outages from blocking all requests
      return true;
    }
  }

  /**
   * Get current rate limit state for a provider
   */
  async getRateLimitState(provider: string, limit: number): Promise<RateLimitState> {
    const key = `${this.config.keyPrefix}${provider}`;
    const now = Date.now();
    const windowStart = now - 60000;

    try {
      // Get current count in the sliding window
      await this.redis.zremrangebyscore(key, '-inf', windowStart);
      const currentCount = await this.redis.zcard(key);

      return {
        provider,
        currentCount,
        limit,
        windowStart,
        windowDuration: 60000,
        allowed: currentCount < limit,
      };
    } catch (error) {
      this.logger.error({ error, provider }, 'Failed to get rate limit state');

      return {
        provider,
        currentCount: 0,
        limit,
        windowStart,
        windowDuration: 60000,
        allowed: true,
      };
    }
  }

  /**
   * Reset rate limit for a provider (admin operation)
   */
  async resetRateLimit(provider: string): Promise<void> {
    const key = `${this.config.keyPrefix}${provider}`;

    try {
      await this.redis.del(key);
      this.logger.info({ provider }, 'Rate limit reset');
    } catch (error) {
      this.logger.error({ error, provider }, 'Failed to reset rate limit');
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    this.logger.info('Redis connection closed');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error({ error }, 'Redis health check failed');
      return false;
    }
  }
}
