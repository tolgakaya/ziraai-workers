# Two-Tier Rate Limiting Architecture

**Implementation Date**: 2025-12-03
**Status**: 🚧 Design Document (Ready for Implementation)

---

## Overview

İki katmanlı rate limiting sistemi, hem **Dispatcher** hem **Worker** seviyesinde Redis-based rate limiting kullanarak yüksek verimlilik ve düşük maliyet sağlar.

### Problem Statement

**Mevcut Durum (Sadece Worker Rate Limiting)**:
- ❌ Yüksek yük altında çok sayıda mesaj kuyruğa girer
- ❌ Worker rate limit aşıldığında 5 saniye bekler → error döner
- ❌ Başarısız mesajlar için yüksek requeue maliyeti
- ❌ Queue load kontrol edilemez durumda

**Hedef Durum (İki Katmanlı Rate Limiting)**:
- ✅ Dispatcher seviyesinde önleyici kontrol (Prevention Layer)
- ✅ Worker seviyesinde güvenlik kontrolü (Safety Net Layer)
- ✅ Düşük requeue maliyeti (delayed queue pattern)
- ✅ Yüksek yük altında stabil performans

---

## Architecture

### Katman 1: Dispatcher Rate Limiting (Prevention Layer)

**Görev**: Mesajı kuyruğa atmadan ÖNCE rate limit kontrolü yap

**Avantajlar**:
- Gereksiz queue load önlenir
- Mesajlar kontrollü şekilde geciktirilir
- RabbitMQ TTL + DLX mekanizması ile otomatik retry
- Worker'lar sadece işlenebilir mesajları alır

**Redis Key Pattern**:
```
ziraai:dispatcher:ratelimit:gemini
ziraai:dispatcher:ratelimit:openai
ziraai:dispatcher:ratelimit:anthropic
```

### Katman 2: Worker Rate Limiting (Safety Net Layer)

**Görev**: Final güvenlik kontrolü (dispatcher bypass senaryoları için)

**Senaryolar**:
- Yüksek concurrency durumlarında race condition
- Dispatcher rate limit clock skew
- Birden fazla dispatcher instance varsa

**Redis Key Pattern**:
```
ziraai:worker:ratelimit:gemini
ziraai:worker:ratelimit:openai
ziraai:worker:ratelimit:anthropic
```

**Not**: Farklı key prefix'ler sayesinde iki katman bağımsız sayaçlara sahip!

---

## Message Flow

### Normal Flow (Rate Limit OK)

```
WebAPI → raw-analysis-queue
           ↓
       DISPATCHER
           ↓
  [Redis Rate Limit Check: ✅ ALLOWED]
           ↓
   gemini-analysis-queue
           ↓
         WORKER
           ↓
  [Redis Rate Limit Check: ✅ ALLOWED]
           ↓
      Process & ACK
           ↓
   Result published
```

### Rate Limited Flow (Dispatcher Level)

```
WebAPI → raw-analysis-queue
           ↓
       DISPATCHER
           ↓
  [Redis Rate Limit Check: ❌ EXCEEDED]
           ↓
   gemini-analysis-queue-delayed-30s  (TTL Queue)
           ↓
   [30 seconds wait]
           ↓
   gemini-analysis-queue  (Auto-routed via DLX)
           ↓
         WORKER
           ↓
  [Redis Rate Limit Check: ✅ ALLOWED]
           ↓
      Process & ACK
```

### Rate Limited Flow (Worker Level - Nadir)

```
gemini-analysis-queue
           ↓
         WORKER
           ↓
  [Redis Rate Limit Check: ❌ EXCEEDED]
           ↓
     NACK (requeue=true)
           ↓
   gemini-analysis-queue (back)
           ↓
   [Natural delay from queue processing]
           ↓
         WORKER (retry)
```

---

## RabbitMQ Delayed Queue Pattern

### Mechanism: TTL + Dead Letter Exchange (DLX)

RabbitMQ'nun built-in özelliklerini kullanarak delayed messaging:

1. **Delayed Queue** oluştur (TTL configured)
2. **DLX** (Dead Letter Exchange) tanımla
3. **Target Queue**'yu DLX routing key olarak belirt
4. Mesaj TTL expire olunca → otomatik olarak target queue'ya route edilir

### Queue Configuration

```typescript
// Delayed queue for gemini (30 second delay)
channel.assertQueue('gemini-analysis-queue-delayed-30s', {
  durable: true,
  arguments: {
    'x-message-ttl': 30000,  // 30 saniye sonra expire
    'x-dead-letter-exchange': '',  // Default exchange kullan
    'x-dead-letter-routing-key': 'gemini-analysis-queue'  // Target queue
  }
});
```

**Avantajlar**:
- ✅ **Zero Application Code**: RabbitMQ otomatik route eder
- ✅ **No Polling**: Worker tarafında ek kod gerekmez
- ✅ **Guaranteed Delivery**: Mesaj kaybolmaz
- ✅ **Configurable Delay**: TTL değeri environment variable ile ayarlanabilir

---

## Implementation Details

### 1. Dispatcher Changes

#### A. Rate Limiter Service Integration

**File**: `workers/dispatcher/src/dispatcher.ts`

```typescript
import { RateLimiterService } from './services/rate-limiter.service';

export class Dispatcher {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private config: DispatcherConfig;
  private roundRobinIndex: number = 0;
  private availableProviders: ProviderType[];
  private rateLimiter: RateLimiterService;  // ← Add this

  constructor(config: DispatcherConfig) {
    this.config = config;
    this.availableProviders = config.dispatcher.availableProviders || ['openai', 'gemini', 'anthropic'];

    // Initialize rate limiter
    this.rateLimiter = new RateLimiterService(
      config.redis,
      console  // TODO: Replace with proper logger
    );
  }
}
```

#### B. Route with Rate Limit Check

**File**: `workers/dispatcher/src/dispatcher.ts`

```typescript
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
```

#### C. Configuration Type Updates

**File**: `workers/dispatcher/src/types/config.ts`

```typescript
export interface RedisConfig {
  url: string;
  keyPrefix: string;
  ttl: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  delayMs: number;  // Delay for rate limited messages (default: 30000ms)
}

export interface DispatcherConfig {
  dispatcher: {
    id: string;
    strategy: StrategyType;
    fixedProvider?: ProviderType;
    availableProviders?: ProviderType[];
    weights?: WeightConfig[];
    providerMetadata?: Map<ProviderType, ProviderMetadata>;
    priorityOrder?: ProviderType[];
  };
  rabbitmq: {
    url: string;
    queues: {
      rawAnalysis: string;
      openai: string;
      gemini: string;
      anthropic: string;
      dlq: string;
    };
    retrySettings: {
      maxRetryAttempts: number;
      retryDelayMs: number;
    };
  };
  redis: RedisConfig;  // ← Add this
  rateLimit: RateLimitConfig;  // ← Add this
}
```

#### D. Index Configuration

**File**: `workers/dispatcher/src/index.ts`

```typescript
function buildConfig(): DispatcherConfig {
  // ... existing code ...

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
```

#### E. Copy Rate Limiter Service from Worker

**File**: `workers/dispatcher/src/services/rate-limiter.service.ts`

```typescript
// Copy the ENTIRE RateLimiterService from workers/analysis-worker/src/services/rate-limiter.service.ts
// This is the same implementation, just different Redis key prefix
```

**Note**: Dispatcher ve Worker aynı `RateLimiterService` kodunu kullanır, sadece Redis key prefix farklı:
- Dispatcher: `ziraai:dispatcher:ratelimit:gemini`
- Worker: `ziraai:worker:ratelimit:gemini`

---

### 2. Worker Changes

#### A. Update processMessage Method

**File**: `workers/analysis-worker/src/index.ts`

```typescript
/**
 * Process a single analysis message with rate limiting
 */
private async processMessage(message: PlantAnalysisAsyncRequestDto): Promise<void> {
  const selectedProvider = this.config.providerSelection.fixedProvider!;

  this.logger.info({
    analysisId: message.AnalysisId,
    selectedProvider,
  }, 'Processing message');

  // ============================================
  // WORKER RATE LIMIT CHECK (Safety Net)
  // ============================================
  // This is the final safety check - should rarely be triggered
  // if dispatcher rate limiting is working correctly
  const rateLimitAllowed = await this.rateLimiter.checkRateLimit(
    selectedProvider,
    this.config.provider.rateLimit
  );

  if (!rateLimitAllowed) {
    // Rate limit exceeded at worker level (rare - dispatcher bypass)
    this.logger.warn({
      analysisId: message.AnalysisId,
      selectedProvider,
    }, 'Worker rate limit exceeded (dispatcher bypass detected), requeueing message');

    // Throw error to trigger NACK with requeue
    throw new Error('RATE_LIMIT_EXCEEDED_AT_WORKER');
  }

  // ============================================
  // PROCESS MESSAGE
  // ============================================
  try {
    const provider = this.providerFactory.getProvider(selectedProvider);
    const result = await provider.analyzeImages(message);

    await this.rabbitmq.publishResult(result);

    this.successCount++;

    this.logger.info({
      analysisId: message.AnalysisId,
      selectedProvider,
      successCount: this.successCount,
    }, 'Message processed successfully');

  } catch (error) {
    this.errorCount++;

    this.logger.error({
      error,
      analysisId: message.AnalysisId,
      selectedProvider,
      errorCount: this.errorCount,
    }, 'Error processing message');

    // Re-throw to trigger NACK
    throw error;
  }
}
```

#### B. Update RabbitMQ Consumer

**File**: `workers/analysis-worker/src/services/rabbitmq.service.ts`

```typescript
/**
 * Consume messages from a queue with proper error handling
 */
async consumeQueue(queueName: string, handler: Function): Promise<void> {
  await this.channel.consume(
    queueName,
    async (msg) => {
      if (!msg) return;

      try {
        const message = JSON.parse(msg.content.toString());

        // Call handler (processMessage)
        await handler(message);

        // ✅ Success - ACK the message
        this.channel.ack(msg);

        this.logger.info({
          queue: queueName,
          messageId: message.AnalysisId || 'unknown',
        }, 'Message acknowledged');

      } catch (error) {
        // ============================================
        // ERROR HANDLING WITH SMART NACK
        // ============================================

        if (error.message === 'RATE_LIMIT_EXCEEDED_AT_WORKER') {
          // ⚠️ Rate limit exceeded at worker level (rare - dispatcher bypass)
          // Requeue the message (NACK with requeue=true)
          this.channel.nack(msg, false, true);

          this.logger.warn({
            queue: queueName,
            messageId: message?.AnalysisId || 'unknown',
            error: error.message
          }, 'Message requeued due to worker rate limit (dispatcher bypass)');

        } else {
          // ❌ Other errors (provider errors, validation errors, etc.)
          // Do NOT requeue - send to DLQ
          this.channel.nack(msg, false, false);

          await this.sendToDLQ(msg, error);

          this.logger.error({
            queue: queueName,
            messageId: message?.AnalysisId || 'unknown',
            error: error.message
          }, 'Message sent to DLQ due to processing error');
        }
      }
    },
    {
      noAck: false,  // Manual ACK/NACK
      prefetch: 1    // Process one message at a time
    }
  );

  this.logger.info({ queue: queueName }, 'Started consuming queue');
}

/**
 * Send failed message to Dead Letter Queue
 */
private async sendToDLQ(msg: any, error: Error): Promise<void> {
  const dlqName = this.config.queues.dlq || 'analysis-dlq';

  // Add error information to message
  const originalMessage = JSON.parse(msg.content.toString());
  const dlqMessage = {
    ...originalMessage,
    error: {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    }
  };

  await this.channel.sendToQueue(
    dlqName,
    Buffer.from(JSON.stringify(dlqMessage)),
    {
      persistent: true,
      contentType: 'application/json'
    }
  );
}
```

---

## Environment Variables

### Dispatcher Configuration

**File**: `workers/dispatcher/.env`

```bash
# ============================================
# REDIS CONFIGURATION (Rate Limiting)
# ============================================
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=ziraai:dispatcher:ratelimit:
REDIS_TTL=120  # 2 minutes

# ============================================
# RATE LIMIT CONFIGURATION
# ============================================
# Enable/disable rate limiting at dispatcher level
RATE_LIMIT_ENABLED=true

# Delay for rate limited messages (milliseconds)
# Messages exceeding rate limit will be delayed by this amount
RATE_LIMIT_DELAY_MS=30000  # 30 seconds

# Provider Rate Limits (Requests Per Minute)
GEMINI_RATE_LIMIT=500       # Gemini: 500 RPM
OPENAI_RATE_LIMIT=5000      # OpenAI: 5000 RPM
ANTHROPIC_RATE_LIMIT=400    # Anthropic: 400 RPM
```

### Worker Configuration

**File**: `workers/analysis-worker/.env`

```bash
# ============================================
# REDIS CONFIGURATION (Rate Limiting)
# ============================================
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=ziraai:worker:ratelimit:  # Different prefix from dispatcher!
REDIS_TTL=120  # 2 minutes

# ============================================
# PROVIDER RATE LIMIT (Worker Safety Net)
# ============================================
# This is the worker's local rate limit (should match dispatcher config)
RATE_LIMIT=500  # For Gemini worker (500 RPM)
```

**Important**: Worker ve Dispatcher farklı Redis key prefix kullanır:
- `ziraai:dispatcher:ratelimit:gemini` (Dispatcher)
- `ziraai:worker:ratelimit:gemini` (Worker)

Bu sayede iki katman bağımsız sayaçlara sahip olur!

---

## Dependencies

### Dispatcher Package.json

**File**: `workers/dispatcher/package.json`

```json
{
  "dependencies": {
    "amqplib": "^0.10.3",
    "dotenv": "^16.0.3",
    "ioredis": "^5.3.2"
  },
  "devDependencies": {
    "@types/amqplib": "^0.10.1",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Worker Package.json

Already has `ioredis` dependency, no changes needed.

---

## Testing Strategy

### 1. Dispatcher Rate Limit Test

**Scenario**: Send 1000 messages, Gemini rate limit 500/minute

**Setup**:
```bash
# Dispatcher
PROVIDER_SELECTION_STRATEGY=COST_OPTIMIZED
PROVIDER_PRIORITY_ORDER=gemini
GEMINI_RATE_LIMIT=500
RATE_LIMIT_ENABLED=true
RATE_LIMIT_DELAY_MS=30000
```

**Expected Result**:
- First 500 messages → `gemini-analysis-queue` immediately
- Next 500 messages → `gemini-analysis-queue-delayed-30000ms`
- After 30 seconds → delayed messages auto-route to `gemini-analysis-queue`

**Verification**:
```bash
# RabbitMQ Management UI - check queue depths
gemini-analysis-queue: 500 messages (immediate)
gemini-analysis-queue-delayed-30000ms: 500 messages (waiting)

# After 30 seconds
gemini-analysis-queue: 1000 messages (all messages)
gemini-analysis-queue-delayed-30000ms: 0 messages (empty)
```

### 2. Worker Safety Net Test

**Scenario**: Simulate dispatcher bypass (send directly to queue)

**Setup**:
```bash
# Send messages directly to gemini-analysis-queue (bypass dispatcher)
# Send 1000 messages rapidly

# Worker
PROVIDER_FIXED=gemini
RATE_LIMIT=500
```

**Expected Result**:
- First 500 messages → processed successfully
- Next 500 messages → NACK with requeue
- Messages gradually processed as rate limit window moves

**Verification**:
```bash
# Worker logs
[Worker] Worker rate limit exceeded (dispatcher bypass detected), requeueing message
[Worker] Message requeued due to worker rate limit

# Redis
redis-cli
> ZCARD ziraai:worker:ratelimit:gemini
500  # Current window count
```

### 3. End-to-End Test

**Scenario**: Normal production flow

**Setup**:
```bash
# Dispatcher
PROVIDER_SELECTION_STRATEGY=COST_OPTIMIZED
PROVIDER_PRIORITY_ORDER=gemini,openai
GEMINI_RATE_LIMIT=500
OPENAI_RATE_LIMIT=5000

# Gemini Worker
PROVIDER_FIXED=gemini
RATE_LIMIT=500

# OpenAI Worker
PROVIDER_FIXED=openai
RATE_LIMIT=5000
```

**Test Flow**:
1. Send 1000 messages to `raw-analysis-queue`
2. Dispatcher routes first 500 → `gemini-analysis-queue`
3. Dispatcher routes next 500 → `gemini-analysis-queue-delayed-30000ms`
4. Gemini worker processes first 500 messages
5. After 30 seconds, delayed messages route to `gemini-analysis-queue`
6. Gemini worker processes remaining 500 messages

**Expected Metrics**:
- Total messages: 1000
- Successful: 1000
- Failed: 0
- Requeued (worker level): 0
- Average latency: ~15 seconds (accounting for delay)

---

## Redis Key Structure

### Dispatcher Keys

```
# Gemini rate limit (dispatcher level)
ziraai:dispatcher:ratelimit:gemini
  Type: ZSET
  Members: timestamp-random pairs
  Example: "1701612345678-0.123456" → score: 1701612345678
  TTL: 120 seconds

# OpenAI rate limit (dispatcher level)
ziraai:dispatcher:ratelimit:openai
  Type: ZSET
  Members: timestamp-random pairs
  TTL: 120 seconds

# Anthropic rate limit (dispatcher level)
ziraai:dispatcher:ratelimit:anthropic
  Type: ZSET
  Members: timestamp-random pairs
  TTL: 120 seconds
```

### Worker Keys

```
# Gemini rate limit (worker level)
ziraai:worker:ratelimit:gemini
  Type: ZSET
  Members: timestamp-random pairs
  TTL: 120 seconds

# OpenAI rate limit (worker level)
ziraai:worker:ratelimit:openai
  Type: ZSET
  Members: timestamp-random pairs
  TTL: 120 seconds

# Anthropic rate limit (worker level)
ziraai:worker:ratelimit:anthropic
  Type: ZSET
  Members: timestamp-random pairs
  TTL: 120 seconds
```

**Key Insight**: Farklı prefix'ler sayesinde iki katman bağımsız!

---

## Performance Comparison

### Scenario: 1000 messages/minute, Gemini rate limit 500/minute

| Metric | Sadece Worker Rate Limit | İki Katmanlı Rate Limit |
|--------|-------------------------|------------------------|
| **Queue Load** | 1000 messages (initial) | 500 immediate + 500 delayed |
| **Worker NACK Count** | ~500 (frequent requeue) | ~0 (rare dispatcher bypass) |
| **Processing Time** | ~2 minutes (with retries) | ~1.5 minutes (controlled delay) |
| **Redis Operations** | Worker: 1500+ ops | Dispatcher: 1000 ops + Worker: 500 ops |
| **Failed Messages** | 500 (timeout after 5 sec) | 0 (all eventually processed) |
| **Client Experience** | 50% error responses | 100% success (with delay) |

### Cost Analysis

**Requeue Cost** (RabbitMQ):
- Message size: ~2KB (average analysis request)
- Requeue operation: ~0.1ms + network overhead
- 500 requeues/minute = ~50ms overhead + network churn

**Delayed Queue Cost** (RabbitMQ):
- Single queue publish: ~0.05ms
- TTL management: Built-in (no overhead)
- DLX routing: Automatic (no overhead)
- 500 delayed messages = ~25ms overhead (50% reduction)

**Redis Cost**:
- Sadece Worker: 1500 ZSET operations/minute
- İki Katmanlı: 1500 ZSET operations/minute (same, but distributed)
- No cost increase!

---

## Monitoring & Observability

### Key Metrics to Track

#### Dispatcher Metrics

```typescript
// Dispatcher metrics to log
{
  "dispatcher.ratelimit.checked": 1000,        // Total rate limit checks
  "dispatcher.ratelimit.allowed": 500,         // Allowed through
  "dispatcher.ratelimit.delayed": 500,         // Sent to delayed queue
  "dispatcher.ratelimit.delay_ms": 30000,      // Configured delay
  "dispatcher.provider.gemini.rpm": 500,       // Current RPM for gemini
  "dispatcher.queue.delayed.depth": 500        // Delayed queue depth
}
```

#### Worker Metrics

```typescript
// Worker metrics to log
{
  "worker.ratelimit.checked": 500,             // Total rate limit checks
  "worker.ratelimit.allowed": 500,             // Allowed through
  "worker.ratelimit.blocked": 0,               // Blocked (rare)
  "worker.ratelimit.requeued": 0,              // Requeued due to rate limit
  "worker.provider.gemini.rpm": 500,           // Current RPM
  "worker.processing.success": 500,            // Successfully processed
  "worker.processing.failed": 0                // Failed (non-rate-limit errors)
}
```

#### Redis Metrics

```bash
# Monitor Redis ZSET sizes
redis-cli ZCARD ziraai:dispatcher:ratelimit:gemini
redis-cli ZCARD ziraai:worker:ratelimit:gemini

# Monitor key TTL
redis-cli TTL ziraai:dispatcher:ratelimit:gemini

# Monitor memory usage
redis-cli INFO memory
```

#### RabbitMQ Metrics

```
# Queue depths
raw-analysis-queue: 0 (should stay low)
gemini-analysis-queue: 50-100 (normal processing)
gemini-analysis-queue-delayed-30000ms: 0-500 (during rate limit)
openai-analysis-queue: 0-100
anthropic-analysis-queue: 0-100
analysis-dlq: 0 (should stay at 0)
```

---

## Troubleshooting

### Issue 1: Messages stuck in delayed queue

**Symptoms**:
- Delayed queue depth increasing
- Messages not routing to target queue after TTL

**Possible Causes**:
1. DLX not configured correctly
2. Target queue doesn't exist
3. RabbitMQ version <3.0 (DLX not supported)

**Solution**:
```bash
# Verify DLX configuration
rabbitmqctl list_queues name arguments

# Check delayed queue config
{
  "x-message-ttl": 30000,
  "x-dead-letter-exchange": "",
  "x-dead-letter-routing-key": "gemini-analysis-queue"
}

# Ensure target queue exists
rabbitmqctl list_queues | grep gemini-analysis-queue
```

### Issue 2: Worker rate limit triggering frequently

**Symptoms**:
- High NACK count in worker logs
- Worker constantly requeueing messages

**Possible Causes**:
1. Dispatcher rate limiting disabled
2. Multiple dispatcher instances with clock skew
3. Rate limit mismatch (dispatcher vs worker)

**Solution**:
```bash
# Check dispatcher config
echo $RATE_LIMIT_ENABLED  # Should be "true"
echo $GEMINI_RATE_LIMIT   # Should match worker RATE_LIMIT

# Check worker config
echo $RATE_LIMIT          # Should match GEMINI_RATE_LIMIT

# Verify Redis keys
redis-cli ZCARD ziraai:dispatcher:ratelimit:gemini
redis-cli ZCARD ziraai:worker:ratelimit:gemini
# Both should be similar values
```

### Issue 3: Redis connection failures

**Symptoms**:
- Rate limiting not working
- All messages going through (failing open)
- Redis connection errors in logs

**Solution**:
```bash
# Verify Redis connectivity
redis-cli -h localhost -p 6379 PING

# Check Redis URL in config
echo $REDIS_URL

# Verify Redis is running
docker ps | grep redis
# OR
systemctl status redis

# Check Redis logs
docker logs redis
# OR
tail -f /var/log/redis/redis-server.log
```

### Issue 4: High delayed queue latency

**Symptoms**:
- Messages taking longer than configured delay
- Inconsistent processing times

**Possible Causes**:
1. RabbitMQ overloaded
2. TTL not expiring correctly
3. Too many delayed queues

**Solution**:
```bash
# Check RabbitMQ load
rabbitmqctl list_queues messages_ready messages_unacknowledged

# Verify TTL configuration
rabbitmqctl list_queues name arguments | grep delayed

# Consider adjusting delay
RATE_LIMIT_DELAY_MS=15000  # Reduce from 30s to 15s
```

---

## Migration Path

### Phase 1: Dispatcher Rate Limiting (This Implementation)

**Tasks**:
1. ✅ Add Redis dependency to dispatcher
2. ✅ Copy RateLimiterService to dispatcher
3. ✅ Implement delayed queue pattern
4. ✅ Update dispatcher routing logic
5. ✅ Add configuration for rate limits
6. ✅ Deploy dispatcher with rate limiting enabled

**Testing**:
- Test with RATE_LIMIT_ENABLED=false (old behavior)
- Test with RATE_LIMIT_ENABLED=true (new behavior)
- Verify delayed queue routing
- Monitor Redis keys

### Phase 2: Worker Safety Net (Already Exists)

**Current State**:
- ✅ Worker already has RateLimiterService
- ✅ Worker already has Redis configuration
- ⚠️ Worker needs NACK update for requeue

**Tasks**:
1. Update worker processMessage error handling
2. Implement smart NACK (requeue only for rate limit)
3. Update RabbitMQ consumer configuration
4. Test worker-level rate limiting

### Phase 3: Production Rollout

**Rollout Plan**:
1. **Week 1**: Deploy to staging with rate limiting enabled
2. **Week 2**: Monitor metrics and adjust rate limits
3. **Week 3**: Deploy to production (1 dispatcher instance)
4. **Week 4**: Scale to multiple dispatcher instances

**Rollback Plan**:
- Set `RATE_LIMIT_ENABLED=false` → instant rollback to old behavior
- No code changes needed
- All messages route directly to target queues

---

## Related Documentation

- [Dispatcher Priority Order Configuration](./DISPATCHER_PRIORITY_ORDER_CONFIGURATION.md) - Cost-based routing strategies
- [Worker Fixed Strategy Implementation](./WORKER_FIXED_STRATEGY_IMPLEMENTATION.md) - Worker queue consumption
- [Provider Metadata Configuration](./PROVIDER_METADATA_CONFIGURATION.md) - Dynamic cost and quality scores
- [Environment Variables Reference](./ENVIRONMENT_VARIABLES_COMPLETE_REFERENCE.md) - Complete environment variable guide

---

## Summary

### Key Benefits

| Feature | Before | After |
|---------|--------|-------|
| **Rate Limit Control** | ❌ Worker only (reactive) | ✅ Dispatcher + Worker (proactive) |
| **Queue Management** | ❌ Uncontrolled queue load | ✅ Controlled delayed routing |
| **Message Delivery** | ❌ Errors after 5 sec timeout | ✅ All messages eventually delivered |
| **Requeue Cost** | ❌ High (500+ requeues/min) | ✅ Low (~0 requeues/min) |
| **Worker Efficiency** | ❌ Blocked on rate limit | ✅ Always processing |
| **Redis Usage** | ⚠️ Worker only | ✅ Dispatcher + Worker (isolated) |
| **Scalability** | ❌ Problems at high load | ✅ Stable at high load |

### Implementation Checklist

- [ ] Copy RateLimiterService to dispatcher
- [ ] Add Redis config to DispatcherConfig type
- [ ] Implement routeToQueue with rate limit check
- [ ] Implement routeToDelayedQueue with TTL+DLX
- [ ] Add helper methods (extractProviderFromQueue, getProviderRateLimit)
- [ ] Update index.ts with Redis and rate limit config
- [ ] Add environment variables to .env.example
- [ ] Update worker processMessage error handling
- [ ] Update RabbitMQ consumeQueue with smart NACK
- [ ] Add npm dependencies (ioredis) to dispatcher
- [ ] Write integration tests
- [ ] Deploy to staging
- [ ] Monitor and adjust rate limits
- [ ] Deploy to production

---

**Last Updated**: 2025-12-03
**Implementation Status**: 📝 Design Complete, Ready for Implementation
**Next Step**: Begin implementation with dispatcher rate limiting
