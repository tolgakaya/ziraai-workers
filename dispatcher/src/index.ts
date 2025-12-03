/**
 * ZiraAI Dispatcher Service - Main Entry Point
 *
 * Consumes from raw-analysis-queue and routes to provider-specific queues
 * based on configured strategy (FIXED, ROUND_ROBIN, COST_OPTIMIZED, etc.)
 */

import * as dotenv from 'dotenv';
import { Dispatcher } from './dispatcher';
import { DispatcherConfig } from './types/config';

// Load environment variables
dotenv.config();

/**
 * Build configuration from environment variables
 */
function buildConfig(): DispatcherConfig {
  // Parse available providers (comma-separated)
  const availableProviders = process.env.AVAILABLE_PROVIDERS
    ? process.env.AVAILABLE_PROVIDERS.split(',').map(p => p.trim() as any)
    : undefined;

  // Parse weights (JSON format: [{"provider":"openai","weight":50},{"provider":"gemini","weight":30}])
  let weights = undefined;
  if (process.env.PROVIDER_WEIGHTS) {
    try {
      weights = JSON.parse(process.env.PROVIDER_WEIGHTS);
    } catch (error) {
      console.error('Failed to parse PROVIDER_WEIGHTS:', error);
      console.log('Expected format: [{"provider":"openai","weight":50},{"provider":"gemini","weight":30}]');
    }
  }

  // Parse provider metadata (JSON format: {"gemini":{"costPerMillion":1.5},"openai":{"costPerMillion":4.0}})
  let providerMetadata = undefined;
  if (process.env.PROVIDER_METADATA) {
    try {
      const metadataObj = JSON.parse(process.env.PROVIDER_METADATA);
      // Convert object to Map with proper types
      providerMetadata = new Map(Object.entries(metadataObj) as [any, any][]);
      console.log('Provider metadata loaded from environment');
    } catch (error) {
      console.error('Failed to parse PROVIDER_METADATA:', error);
      console.log('Expected format: {"gemini":{"costPerMillion":1.5},"openai":{"costPerMillion":4.0}}');
    }
  }

  // Parse priority order for COST_OPTIMIZED strategy (comma-separated: "gemini,openai,anthropic")
  const priorityOrder = process.env.PROVIDER_PRIORITY_ORDER
    ? process.env.PROVIDER_PRIORITY_ORDER.split(',').map(p => p.trim() as any)
    : undefined;

  return {
    dispatcher: {
      id: process.env.DISPATCHER_ID || 'dispatcher-001',
      strategy: (process.env.PROVIDER_SELECTION_STRATEGY as any) || 'FIXED',
      fixedProvider: (process.env.PROVIDER_FIXED as any) || 'openai',
      availableProviders,
      weights,
      providerMetadata,
      priorityOrder
    },
    rabbitmq: {
      url: process.env.RABBITMQ_URL || 'amqp://dev:devpass@localhost:5672/',
      queues: {
        rawAnalysis: process.env.RAW_ANALYSIS_QUEUE || 'raw-analysis-queue',
        openai: process.env.OPENAI_QUEUE || 'openai-analysis-queue',
        gemini: process.env.GEMINI_QUEUE || 'gemini-analysis-queue',
        anthropic: process.env.ANTHROPIC_QUEUE || 'anthropic-analysis-queue',
        dlq: process.env.DLQ_QUEUE || 'analysis-dlq'
      },
      retrySettings: {
        maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
        retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000')
      }
    },
    // ============================================
    // REDIS CONFIGURATION (Rate Limiting)
    // ============================================
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'ziraai:dispatcher:ratelimit:',
      ttl: parseInt(process.env.REDIS_TTL || '120')
    },
    // ============================================
    // RATE LIMIT CONFIGURATION
    // ============================================
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false',  // Default: true
      delayMs: parseInt(process.env.RATE_LIMIT_DELAY_MS || '30000')  // Default: 30 seconds
    }
  };
}

/**
 * Debug: Log configuration on startup
 */
function logConfiguration(config: DispatcherConfig): void {
  console.log('='.repeat(60));
  console.log('DISPATCHER CONFIGURATION');
  console.log('='.repeat(60));
  console.log(`Dispatcher ID: ${config.dispatcher.id}`);
  console.log(`Strategy: ${config.dispatcher.strategy}`);
  console.log(`Available Providers: ${config.dispatcher.availableProviders?.join(', ')}`);
  console.log(`\nRate Limiting:`);
  console.log(`  Enabled: ${config.rateLimit.enabled}`);
  console.log(`  Delay: ${config.rateLimit.delayMs}ms`);
  console.log(`  GEMINI_RATE_LIMIT: ${process.env.GEMINI_RATE_LIMIT}`);
  console.log(`  OPENAI_RATE_LIMIT: ${process.env.OPENAI_RATE_LIMIT}`);
  console.log(`\nRedis:`);
  console.log(`  URL: ${config.redis.url}`);
  console.log(`  Key Prefix: ${config.redis.keyPrefix}`);
  console.log(`  TTL: ${config.redis.ttl}s`);
  console.log('='.repeat(60));
}

/**
 * Create dispatcher configuration from environment variables
 */
function createConfigFromEnv(): DispatcherConfig {
  // Parse available providers (comma-separated: "openai,gemini,anthropic")
  const availableProviders = process.env.AVAILABLE_PROVIDERS
    ? process.env.AVAILABLE_PROVIDERS.split(',').map(p => p.trim() as any)
    : undefined;

  // Parse weights (JSON array: [{"provider":"openai","weight":50}])
  let weights = undefined;
  if (process.env.PROVIDER_WEIGHTS) {
    try {
      weights = JSON.parse(process.env.PROVIDER_WEIGHTS);
    } catch (error) {
      console.error('Failed to parse PROVIDER_WEIGHTS:', error);
      console.log('Expected format: [{"provider":"openai","weight":50},{"provider":"gemini","weight":30}]');
    }
  }

  // Parse provider metadata (JSON format: {"gemini":{"costPerMillion":1.5},"openai":{"costPerMillion":4.0}})
  let providerMetadata = undefined;
  if (process.env.PROVIDER_METADATA) {
    try {
      const metadataObj = JSON.parse(process.env.PROVIDER_METADATA);
      // Convert object to Map with proper types
      providerMetadata = new Map(Object.entries(metadataObj) as [any, any][]);
      console.log('Provider metadata loaded from environment');
    } catch (error) {
      console.error('Failed to parse PROVIDER_METADATA:', error);
      console.log('Expected format: {"gemini":{"costPerMillion":1.5},"openai":{"costPerMillion":4.0}}');
    }
  }

  // Parse priority order for COST_OPTIMIZED strategy (comma-separated: "gemini,openai,anthropic")
  const priorityOrder = process.env.PROVIDER_PRIORITY_ORDER
    ? process.env.PROVIDER_PRIORITY_ORDER.split(',').map(p => p.trim() as any)
    : undefined;

  return {
    dispatcher: {
      id: process.env.DISPATCHER_ID || 'dispatcher-001',
      strategy: (process.env.PROVIDER_SELECTION_STRATEGY as any) || 'FIXED',
      fixedProvider: (process.env.PROVIDER_FIXED as any) || 'openai',
      availableProviders,
      weights,
      providerMetadata,
      priorityOrder
    },
    rabbitmq: {
      url: process.env.RABBITMQ_URL || 'amqp://dev:devpass@localhost:5672/',
      queues: {
        rawAnalysis: process.env.RAW_ANALYSIS_QUEUE || 'raw-analysis-queue',
        openai: process.env.OPENAI_QUEUE || 'openai-analysis-queue',
        gemini: process.env.GEMINI_QUEUE || 'gemini-analysis-queue',
        anthropic: process.env.ANTHROPIC_QUEUE || 'anthropic-analysis-queue',
        dlq: process.env.DLQ_QUEUE || 'analysis-dlq'
      },
      retrySettings: {
        maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
        retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000')
      }
    },
    // ============================================
    // REDIS CONFIGURATION (Rate Limiting)
    // ============================================
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'ziraai:dispatcher:ratelimit:',
      ttl: parseInt(process.env.REDIS_TTL || '120')
    },
    // ============================================
    // RATE LIMIT CONFIGURATION
    // ============================================
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false',  // Default: true
      delayMs: parseInt(process.env.RATE_LIMIT_DELAY_MS || '30000')  // Default: 30 seconds
    }
  };
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(80));
  console.log('ZiraAI Dispatcher Service');
  console.log('Platform Modernization - Phase 1, Day 5');
  console.log('='.repeat(80));

  const config = buildConfig();

  // Log full configuration for debugging
  logConfiguration(config);

  console.log('\nConfiguration:');
  console.log(`  Dispatcher ID: ${config.dispatcher.id}`);
  console.log(`  Strategy: ${config.dispatcher.strategy}`);

  // Strategy-specific configuration
  if (config.dispatcher.strategy === 'FIXED') {
    console.log(`  Fixed Provider: ${config.dispatcher.fixedProvider || 'openai'}`);
  } else if (config.dispatcher.strategy === 'ROUND_ROBIN' || config.dispatcher.strategy === 'COST_OPTIMIZED' || config.dispatcher.strategy === 'QUALITY_FIRST') {
    console.log(`  Available Providers: ${config.dispatcher.availableProviders?.join(', ') || 'openai, gemini, anthropic'}`);
  } else if (config.dispatcher.strategy === 'WEIGHTED') {
    console.log(`  Weights: ${JSON.stringify(config.dispatcher.weights || [])}`);
  } else if (config.dispatcher.strategy === 'MESSAGE_BASED') {
    console.log(`  Mode: Read provider from request message`);
  }

  console.log(`  RabbitMQ URL: ${config.rabbitmq.url}`);
  console.log(`  Raw Analysis Queue: ${config.rabbitmq.queues.rawAnalysis}`);
  console.log(`  OpenAI Queue: ${config.rabbitmq.queues.openai}`);
  console.log(`  Gemini Queue: ${config.rabbitmq.queues.gemini}`);
  console.log(`  Anthropic Queue: ${config.rabbitmq.queues.anthropic}`);
  console.log(`  DLQ Queue: ${config.rabbitmq.queues.dlq}`);
  console.log('');

  const dispatcher = new Dispatcher(config);

  // Graceful shutdown handlers
  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, shutting down gracefully...');
    await dispatcher.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nReceived SIGTERM, shutting down gracefully...');
    await dispatcher.shutdown();
    process.exit(0);
  });

  try {
    // Connect to RabbitMQ
    await dispatcher.connect();

    // Start consuming from raw-analysis-queue
    await dispatcher.startConsuming();

    console.log('\n✅ Dispatcher service is running...');
    console.log('Press Ctrl+C to stop\n');
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the service
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
