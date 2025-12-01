# Environment Variables Reference - Analysis Worker

**Complete reference for Railway deployment configuration**

**Last Updated**: 1 Aralık 2025
**Target Environment**: Railway Staging/Production

---

## 📋 Quick Reference

### Required Variables (Minimum Configuration)
```bash
WORKER_ID=worker-staging-1
NODE_ENV=staging
RABBITMQ_URL=amqps://user:pass@host.cloudamqp.com/vhost
REDIS_URL=redis://default:password@redis.railway.internal:6379
RESULT_QUEUE=analysis-results-queue
DLQ_QUEUE=analysis-dlq
```

**Plus at least ONE provider API key**:
```bash
GEMINI_API_KEY=AIzaSy...        # Recommended for cost optimization
# OR
OPENAI_API_KEY=sk-proj-...      # Alternative
# OR
ANTHROPIC_API_KEY=sk-ant-...    # Alternative
```

---

## 🔧 Complete Variable List

### 1. Worker Identification

#### `WORKER_ID` (Required)
**Purpose**: Unique identifier for this worker instance
**Format**: String (alphanumeric, hyphens allowed)
**Default**: None (must be set)

**Examples**:
```bash
# Single worker
WORKER_ID=worker-staging-1

# Multiple workers (Railway auto-scaling)
WORKER_ID=worker-staging-$RAILWAY_REPLICA_ID

# Environment-specific naming
WORKER_ID=worker-production-eu-west-1
WORKER_ID=worker-development-local
```

**Railway Best Practice**:
```bash
# Railway automatically provides RAILWAY_REPLICA_ID for scaled instances
WORKER_ID=worker-staging-$RAILWAY_REPLICA_ID
```

---

#### `NODE_ENV` (Required)
**Purpose**: Runtime environment identifier
**Format**: `development` | `staging` | `production`
**Default**: None (must be set)

**Examples**:
```bash
NODE_ENV=development    # Local development, pretty logs, verbose debugging
NODE_ENV=staging        # Railway staging, structured JSON logs
NODE_ENV=production     # Railway production, optimized performance
```

**Impact**:
- `development`: Enables pino-pretty colored logs
- `staging/production`: JSON structured logs for Railway monitoring

---

### 2. AI Provider API Keys

#### `OPENAI_API_KEY` (Optional - at least 1 provider required)
**Purpose**: OpenAI API authentication
**Format**: `sk-proj-...` (project key) or `sk-...` (legacy key)
**Default**: None
**Provider**: https://platform.openai.com/api-keys

**Examples**:
```bash
OPENAI_API_KEY=sk-proj-abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yz
```

**Model Used**: `gpt-4o-mini` (configurable via PROVIDER_MODEL)
**Default Cost**: $5.125 per 1M tokens (configurable via PROVIDER_METADATA)
**Default Quality**: 8/10 (configurable via PROVIDER_METADATA)

---

#### `GEMINI_API_KEY` (Optional - at least 1 provider required)
**Purpose**: Google Gemini API authentication
**Format**: `AIzaSy...`
**Default**: None
**Provider**: https://makersuite.google.com/app/apikey

**Examples**:
```bash
GEMINI_API_KEY=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890
```

**Model Used**: `gemini-2.0-flash-exp` (hardcoded in gemini.provider.ts)
**Default Cost**: $1.087 per 1M tokens (configurable via PROVIDER_METADATA)
**Default Quality**: 7/10 (configurable via PROVIDER_METADATA)

---

#### `ANTHROPIC_API_KEY` (Optional - at least 1 provider required)
**Purpose**: Anthropic Claude API authentication
**Format**: `sk-ant-api...`
**Default**: None
**Provider**: https://console.anthropic.com/settings/keys

**Examples**:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnop
```

**Model Used**: `claude-3-5-sonnet-20241022` (hardcoded in anthropic.provider.ts)
**Default Cost**: $48.0 per 1M tokens (configurable via PROVIDER_METADATA)
**Default Quality**: 10/10 (configurable via PROVIDER_METADATA)

---

### 3. Provider Selection Strategy

#### `PROVIDER_SELECTION_STRATEGY` (Optional)
**Purpose**: Algorithm for selecting which AI provider processes each message
**Format**: `FIXED` | `ROUND_ROBIN` | `COST_OPTIMIZED` | `QUALITY_FIRST` | `MESSAGE_BASED` | `WEIGHTED`
**Default**: `ROUND_ROBIN`

**Examples**:

**FIXED** - Always use one specific provider:
```bash
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=gemini    # Must specify which provider
```

**ROUND_ROBIN** - Distribute evenly across all providers:
```bash
PROVIDER_SELECTION_STRATEGY=ROUND_ROBIN
# No additional config needed
# Result: OpenAI → Gemini → Anthropic → OpenAI → ...
```

**COST_OPTIMIZED** - Prefer cheapest provider based on metadata:
```bash
PROVIDER_SELECTION_STRATEGY=COST_OPTIMIZED
# No additional config needed
# Default result: Gemini ($1.087) → OpenAI ($5.125) → Anthropic ($48.0)
# Rankings change if you update PROVIDER_METADATA
```

**QUALITY_FIRST** - Prefer highest quality provider:
```bash
PROVIDER_SELECTION_STRATEGY=QUALITY_FIRST
# No additional config needed
# Default result: Anthropic (10) → OpenAI (8) → Gemini (7)
# Rankings change if you update PROVIDER_METADATA
```

**MESSAGE_BASED** - Use provider specified in message (legacy n8n behavior):
```bash
PROVIDER_SELECTION_STRATEGY=MESSAGE_BASED
# Worker reads message.provider field
# Fallback to first available if not specified
```

**WEIGHTED** - Custom distribution percentages:
```bash
PROVIDER_SELECTION_STRATEGY=WEIGHTED
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":70},{"provider":"openai","weight":20},{"provider":"anthropic","weight":10}]
# Result: 70% Gemini, 20% OpenAI, 10% Anthropic
```

---

#### `PROVIDER_FIXED` (Optional - required for FIXED strategy)
**Purpose**: Specify which provider to use with FIXED strategy
**Format**: `openai` | `gemini` | `anthropic`
**Default**: None
**Required When**: `PROVIDER_SELECTION_STRATEGY=FIXED`

**Examples**:
```bash
# Use only Gemini (cheapest)
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=gemini
GEMINI_API_KEY=AIzaSy...

# Use only OpenAI (balanced cost/quality)
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=openai
OPENAI_API_KEY=sk-proj-...

# Use only Anthropic (highest quality)
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

---

#### `PROVIDER_WEIGHTS` (Optional - required for WEIGHTED strategy)
**Purpose**: Custom distribution percentages for each provider
**Format**: JSON array of `{"provider":"name","weight":number}`
**Default**: None
**Required When**: `PROVIDER_SELECTION_STRATEGY=WEIGHTED`

**Examples**:

**70% Gemini, 30% OpenAI** (cost-conscious with quality backup):
```bash
PROVIDER_SELECTION_STRATEGY=WEIGHTED
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":70},{"provider":"openai","weight":30}]
```

**50% Gemini, 30% OpenAI, 20% Anthropic** (balanced distribution):
```bash
PROVIDER_SELECTION_STRATEGY=WEIGHTED
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":50},{"provider":"openai","weight":30},{"provider":"anthropic","weight":20}]
```

**90% Gemini, 5% OpenAI, 5% Anthropic** (maximum cost optimization):
```bash
PROVIDER_SELECTION_STRATEGY=WEIGHTED
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":90},{"provider":"openai","weight":5},{"provider":"anthropic","weight":5}]
```

**Notes**:
- Weights automatically normalized to 100% (e.g., [50,30,20] or [5,3,2] give same result)
- Only providers with valid API keys will be used
- Unused providers are skipped

---

#### `PROVIDER_METADATA` (Optional - override default costs/quality)
**Purpose**: Override default cost and quality scores for dynamic ranking
**Format**: JSON object with provider-specific metadata
**Default**: See [provider-selector.service.ts:60-82](../../../analysis-worker/src/services/provider-selector.service.ts#L60-L82)

**Default Values** (November 2024):
```json
{
  "gemini": {
    "costPerMillion": 1.087,
    "qualityScore": 7,
    "inputCostPerMillion": 0.075,
    "outputCostPerMillion": 0.30
  },
  "openai": {
    "costPerMillion": 5.125,
    "qualityScore": 8,
    "inputCostPerMillion": 0.25,
    "outputCostPerMillion": 2.00
  },
  "anthropic": {
    "costPerMillion": 48.0,
    "qualityScore": 10,
    "inputCostPerMillion": 3.00,
    "outputCostPerMillion": 15.00
  }
}
```

**Override Examples**:

**Update only costs** (after provider pricing changes):
```bash
# Gemini raised prices, OpenAI lowered prices
PROVIDER_METADATA={"gemini":{"costPerMillion":1.5},"openai":{"costPerMillion":4.0}}
```

**Update only quality scores** (after A/B testing):
```bash
# Measured actual quality performance
PROVIDER_METADATA={"gemini":{"qualityScore":8.5},"openai":{"qualityScore":8.2},"anthropic":{"qualityScore":9.8}}
```

**Complete override** (costs + quality):
```bash
PROVIDER_METADATA={"gemini":{"costPerMillion":1.2,"qualityScore":8},"openai":{"costPerMillion":5.5,"qualityScore":9},"anthropic":{"costPerMillion":50.0,"qualityScore":9.5}}
```

**Detailed costs** (separate input/output):
```bash
PROVIDER_METADATA={"gemini":{"inputCostPerMillion":0.10,"outputCostPerMillion":0.40,"costPerMillion":1.5,"qualityScore":8}}
```

**Impact on Strategies**:
- **COST_OPTIMIZED**: Re-ranks providers by updated costs
- **QUALITY_FIRST**: Re-ranks providers by updated quality scores
- **Logging**: Shows updated values in debug logs

**See**: [PROVIDER_METADATA_CONFIGURATION.md](./PROVIDER_METADATA_CONFIGURATION.md) for comprehensive guide

---

### 4. RabbitMQ Configuration

#### `RABBITMQ_URL` (Required)
**Purpose**: Connection string for RabbitMQ message broker
**Format**: `amqp://` or `amqps://` URI
**Default**: None (must be set)

**Examples**:

**Railway CloudAMQP** (recommended):
```bash
RABBITMQ_URL=${{RabbitMQ.CLOUDAMQP_URL}}
# Railway auto-injects this from CloudAMQP service
```

**Manual CloudAMQP**:
```bash
RABBITMQ_URL=amqps://username:password@cheetah.rmq.cloudamqp.com/vhostname
```

**Local RabbitMQ** (development):
```bash
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

**Custom RabbitMQ** (self-hosted):
```bash
RABBITMQ_URL=amqps://admin:secretpass@rabbitmq.example.com:5671/production
```

---

#### `RESULT_QUEUE` (Required)
**Purpose**: Queue name for publishing completed analysis results
**Format**: String (queue name)
**Default**: None (must be set)
**Recommended**: `analysis-results-queue`

**Examples**:
```bash
RESULT_QUEUE=analysis-results-queue           # Standard
RESULT_QUEUE=analysis-results-staging         # Environment-specific
RESULT_QUEUE=plant-analysis-results-v2        # Versioned
```

---

#### `DLQ_QUEUE` (Required)
**Purpose**: Dead Letter Queue for failed messages after max retries
**Format**: String (queue name)
**Default**: None (must be set)
**Recommended**: `analysis-dlq`

**Examples**:
```bash
DLQ_QUEUE=analysis-dlq                        # Standard
DLQ_QUEUE=analysis-dlq-staging                # Environment-specific
DLQ_QUEUE=plant-analysis-dead-letter         # Descriptive
```

---

#### `PREFETCH_COUNT` (Optional)
**Purpose**: Max number of unacknowledged messages per worker
**Format**: Integer (1-100)
**Default**: `10`
**Recommended**: `10` (moderate), `5` (conservative), `20` (aggressive)

**Examples**:
```bash
PREFETCH_COUNT=10    # Default - balanced throughput/memory
PREFETCH_COUNT=5     # Conservative - lower memory, slower processing
PREFETCH_COUNT=20    # Aggressive - higher throughput, more memory
PREFETCH_COUNT=1     # Serial processing - debugging/troubleshooting
```

**Guidelines**:
- **Low traffic** (< 100 msg/hour): `PREFETCH_COUNT=5`
- **Medium traffic** (100-1000 msg/hour): `PREFETCH_COUNT=10`
- **High traffic** (> 1000 msg/hour): `PREFETCH_COUNT=20` + scale workers

---

### 5. Redis Configuration

#### `REDIS_URL` (Required)
**Purpose**: Connection string for Redis rate limiting
**Format**: `redis://` URI
**Default**: None (must be set)

**Examples**:

**Railway Redis** (recommended):
```bash
REDIS_URL=${{Redis.REDIS_URL}}
# Railway auto-injects this from Redis service
```

**Railway Internal**:
```bash
REDIS_URL=redis://default:password@redis.railway.internal:6379
```

**Redis Cloud**:
```bash
REDIS_URL=redis://default:password@redis-12345.c1.us-east-1-1.ec2.cloud.redislabs.com:12345
```

**Local Redis** (development):
```bash
REDIS_URL=redis://localhost:6379
```

**Redis with authentication**:
```bash
REDIS_URL=redis://username:password@redis.example.com:6379/0
```

---

#### `REDIS_KEY_PREFIX` (Optional)
**Purpose**: Prefix for all Redis keys (namespace isolation)
**Format**: String (colon-separated recommended)
**Default**: `ziraai:ratelimit:`
**Recommended**: `ziraai:{environment}:ratelimit:`

**Examples**:
```bash
REDIS_KEY_PREFIX=ziraai:staging:ratelimit:      # Staging environment
REDIS_KEY_PREFIX=ziraai:production:ratelimit:   # Production environment
REDIS_KEY_PREFIX=ziraai:dev:ratelimit:          # Development
REDIS_KEY_PREFIX=plantai:v2:ratelimit:          # Different project/version
```

**Resulting Keys**:
```
ziraai:staging:ratelimit:openai
ziraai:staging:ratelimit:gemini
ziraai:staging:ratelimit:anthropic
```

---

#### `REDIS_TTL` (Optional)
**Purpose**: Time-to-live for rate limit keys (seconds)
**Format**: Integer (seconds)
**Default**: `120` (2 minutes)
**Recommended**: `60-300` (1-5 minutes)

**Examples**:
```bash
REDIS_TTL=60      # 1 minute - short window, stricter limiting
REDIS_TTL=120     # 2 minutes - default, balanced
REDIS_TTL=300     # 5 minutes - longer window, smoother limiting
REDIS_TTL=600     # 10 minutes - very permissive
```

**Impact**:
- Lower values: Stricter rate limiting, faster key cleanup
- Higher values: More permissive, longer memory retention

---

### 6. Provider-Specific Settings

#### `PROVIDER_MODEL` (Optional)
**Purpose**: Override default model for OpenAI provider
**Format**: String (OpenAI model name)
**Default**: `gpt-4o-mini`
**Applies To**: OpenAI only (Gemini and Anthropic use hardcoded models)

**Examples**:
```bash
PROVIDER_MODEL=gpt-4o-mini              # Default - cheapest GPT-4 class
PROVIDER_MODEL=gpt-4o                   # More capable, higher cost
PROVIDER_MODEL=gpt-4-turbo              # Legacy model
PROVIDER_MODEL=gpt-3.5-turbo            # Budget option
```

**Note**: Gemini uses `gemini-2.0-flash-exp`, Anthropic uses `claude-3-5-sonnet-20241022` (hardcoded)

---

#### `RATE_LIMIT` (Optional)
**Purpose**: Max requests per minute per provider
**Format**: Integer (requests/minute)
**Default**: `350` (OpenAI tier 2 default)
**Provider Limits**:
- **OpenAI**: 500-10,000 RPM (tier-dependent)
- **Gemini**: 2,000 RPM (free tier), 360,000 RPM (paid)
- **Anthropic**: 50 RPM (tier 1), 1,000+ RPM (higher tiers)

**Examples**:

**OpenAI Tier 2** (default):
```bash
RATE_LIMIT=350
```

**OpenAI Tier 3**:
```bash
RATE_LIMIT=500
```

**Gemini Free Tier**:
```bash
RATE_LIMIT=2000
```

**Anthropic Tier 1**:
```bash
RATE_LIMIT=50
```

**Conservative** (avoid hitting limits):
```bash
RATE_LIMIT=100    # Well under most tier limits
```

**Aggressive** (tier 4+):
```bash
RATE_LIMIT=5000
```

---

#### `TIMEOUT` (Optional)
**Purpose**: Max time to wait for provider API response (milliseconds)
**Format**: Integer (milliseconds)
**Default**: `60000` (60 seconds)
**Recommended**: `30000-120000` (30 seconds - 2 minutes)

**Examples**:
```bash
TIMEOUT=30000     # 30 seconds - aggressive, faster failures
TIMEOUT=60000     # 60 seconds - default, balanced
TIMEOUT=90000     # 90 seconds - permissive for complex analyses
TIMEOUT=120000    # 2 minutes - very permissive, high-resolution images
```

**Guidelines**:
- **Simple analyses** (single image, low res): `TIMEOUT=30000`
- **Standard analyses** (multiple images, medium res): `TIMEOUT=60000`
- **Complex analyses** (high-res images, detailed reports): `TIMEOUT=90000`

---

### 7. Logging & Monitoring

#### `LOG_LEVEL` (Optional)
**Purpose**: Verbosity of application logs
**Format**: `debug` | `info` | `warn` | `error`
**Default**: `info`

**Examples**:

**Production** (recommended):
```bash
LOG_LEVEL=info
# Logs: startup, provider selection, errors, warnings
# No debug details (reduces log volume)
```

**Staging** (detailed monitoring):
```bash
LOG_LEVEL=debug
# Logs: all provider selection decisions, metadata, rankings, queue operations
# Good for verifying strategy behavior
```

**Production (minimal)**:
```bash
LOG_LEVEL=warn
# Logs: only warnings and errors
# Reduces costs in high-volume scenarios
```

**Troubleshooting**:
```bash
LOG_LEVEL=debug
# Temporarily enable for debugging, revert to info after
```

---

#### `HEALTH_CHECK_INTERVAL` (Optional)
**Purpose**: Interval for internal health checks (milliseconds)
**Format**: Integer (milliseconds)
**Default**: `30000` (30 seconds)
**Recommended**: `10000-60000` (10-60 seconds)

**Examples**:
```bash
HEALTH_CHECK_INTERVAL=30000    # Default - balanced
HEALTH_CHECK_INTERVAL=10000    # Frequent - faster issue detection
HEALTH_CHECK_INTERVAL=60000    # Infrequent - lower overhead
```

---

#### `CONCURRENCY` (Optional)
**Purpose**: Max concurrent operations per worker
**Format**: Integer (1-100)
**Default**: `60`
**Recommended**: `30-60` (most scenarios)

**Examples**:
```bash
CONCURRENCY=30     # Conservative - 512MB RAM workers
CONCURRENCY=60     # Default - 1GB RAM workers
CONCURRENCY=100    # Aggressive - 2GB+ RAM workers
```

**Guidelines by Worker Memory**:
- **512MB RAM**: `CONCURRENCY=30`
- **1GB RAM**: `CONCURRENCY=60`
- **2GB RAM**: `CONCURRENCY=100`

---

## 🚀 Deployment Templates

### Template 1: Minimum Viable (Single Provider - Gemini)

```bash
# Worker
WORKER_ID=worker-staging-1
NODE_ENV=staging

# Provider
GEMINI_API_KEY=AIzaSy...

# RabbitMQ
RABBITMQ_URL=${{RabbitMQ.CLOUDAMQP_URL}}
RESULT_QUEUE=analysis-results-queue
DLQ_QUEUE=analysis-dlq

# Redis
REDIS_URL=${{Redis.REDIS_URL}}
```

**Use Case**: Testing, development, minimal cost
**Cost**: ~$0.108 per 1,000 analyses

---

### Template 2: Cost-Optimized Multi-Provider

```bash
# Worker
WORKER_ID=worker-staging-$RAILWAY_REPLICA_ID
NODE_ENV=staging
LOG_LEVEL=info
CONCURRENCY=60

# Providers (all 3 for failover)
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIzaSy...
ANTHROPIC_API_KEY=sk-ant-...

# Strategy
PROVIDER_SELECTION_STRATEGY=COST_OPTIMIZED

# RabbitMQ
RABBITMQ_URL=${{RabbitMQ.CLOUDAMQP_URL}}
RESULT_QUEUE=analysis-results-queue
DLQ_QUEUE=analysis-dlq
PREFETCH_COUNT=10

# Redis
REDIS_URL=${{Redis.REDIS_URL}}
REDIS_KEY_PREFIX=ziraai:staging:ratelimit:
REDIS_TTL=120

# Provider Config
RATE_LIMIT=350
TIMEOUT=60000

# Monitoring
HEALTH_CHECK_INTERVAL=30000
```

**Use Case**: Production, cost-conscious
**Cost**: ~$0.108-0.171 per 1,000 analyses (95% Gemini success)

---

### Template 3: Quality-First Multi-Provider

```bash
# Worker
WORKER_ID=worker-production-$RAILWAY_REPLICA_ID
NODE_ENV=production
LOG_LEVEL=info
CONCURRENCY=60

# Providers
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIzaSy...
ANTHROPIC_API_KEY=sk-ant-...

# Strategy
PROVIDER_SELECTION_STRATEGY=QUALITY_FIRST

# RabbitMQ
RABBITMQ_URL=${{RabbitMQ.CLOUDAMQP_URL}}
RESULT_QUEUE=analysis-results-queue
DLQ_QUEUE=analysis-dlq
PREFETCH_COUNT=10

# Redis
REDIS_URL=${{Redis.REDIS_URL}}
REDIS_KEY_PREFIX=ziraai:production:ratelimit:
REDIS_TTL=120

# Provider Config
RATE_LIMIT=350
TIMEOUT=90000

# Monitoring
HEALTH_CHECK_INTERVAL=30000
```

**Use Case**: Premium service, maximum accuracy
**Cost**: ~$4.80 per 1,000 analyses (95% Anthropic)

---

### Template 4: Weighted Distribution (Custom Balance)

```bash
# Worker
WORKER_ID=worker-staging-$RAILWAY_REPLICA_ID
NODE_ENV=staging
LOG_LEVEL=debug
CONCURRENCY=60

# Providers
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIzaSy...
ANTHROPIC_API_KEY=sk-ant-...

# Strategy: 70% Gemini, 20% OpenAI, 10% Anthropic
PROVIDER_SELECTION_STRATEGY=WEIGHTED
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":70},{"provider":"openai","weight":20},{"provider":"anthropic","weight":10}]

# RabbitMQ
RABBITMQ_URL=${{RabbitMQ.CLOUDAMQP_URL}}
RESULT_QUEUE=analysis-results-queue
DLQ_QUEUE=analysis-dlq
PREFETCH_COUNT=10

# Redis
REDIS_URL=${{Redis.REDIS_URL}}
REDIS_KEY_PREFIX=ziraai:staging:ratelimit:
REDIS_TTL=120

# Provider Config
RATE_LIMIT=350
TIMEOUT=60000

# Monitoring
HEALTH_CHECK_INTERVAL=30000
```

**Use Case**: Custom cost/quality balance
**Cost**: ~$0.658 per 1,000 analyses (with example weights)

---

### Template 5: Development/Local Testing

```bash
# Worker
WORKER_ID=worker-dev-local
NODE_ENV=development
LOG_LEVEL=debug
CONCURRENCY=10

# Provider (single for simplicity)
GEMINI_API_KEY=AIzaSy...

# Strategy
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=gemini

# RabbitMQ (local)
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RESULT_QUEUE=analysis-results-queue
DLQ_QUEUE=analysis-dlq
PREFETCH_COUNT=5

# Redis (local)
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=ziraai:dev:ratelimit:
REDIS_TTL=60

# Provider Config
RATE_LIMIT=100
TIMEOUT=60000

# Monitoring
HEALTH_CHECK_INTERVAL=10000
```

**Use Case**: Local development, debugging

---

## 🔍 Validation Checklist

### Required Variables
- [ ] `WORKER_ID` - Set and unique
- [ ] `NODE_ENV` - `staging` or `production`
- [ ] `RABBITMQ_URL` - Valid connection string
- [ ] `REDIS_URL` - Valid connection string
- [ ] `RESULT_QUEUE` - Queue name specified
- [ ] `DLQ_QUEUE` - DLQ name specified
- [ ] At least ONE provider API key set

### Strategy-Specific Requirements
- [ ] If `PROVIDER_SELECTION_STRATEGY=FIXED` → `PROVIDER_FIXED` set
- [ ] If `PROVIDER_SELECTION_STRATEGY=WEIGHTED` → `PROVIDER_WEIGHTS` set

### Recommended (Not Required)
- [ ] `LOG_LEVEL` - Set to `info` (production) or `debug` (staging)
- [ ] `PREFETCH_COUNT` - Adjusted for traffic volume
- [ ] `CONCURRENCY` - Matches worker RAM allocation
- [ ] `RATE_LIMIT` - Matches provider tier limits
- [ ] `PROVIDER_METADATA` - Updated with current pricing

---

## 📚 Related Documentation

- **Provider Metadata**: [PROVIDER_METADATA_CONFIGURATION.md](./PROVIDER_METADATA_CONFIGURATION.md)
- **Railway Deployment**: [RAILWAY_STAGING_DEPLOYMENT.md](./RAILWAY_STAGING_DEPLOYMENT.md)
- **Strategy Details**: Section 3 of this document

---

## 🆘 Troubleshooting

### Worker Won't Start

**Check**:
```bash
railway logs | grep -i "error\|missing"
```

**Common Issues**:
- Missing required variable (WORKER_ID, NODE_ENV, RABBITMQ_URL, REDIS_URL)
- Invalid RABBITMQ_URL format
- No provider API keys configured

---

### Provider Not Being Used

**Check**:
```bash
railway logs | grep -i "provider.*initialized"
```

**Common Issues**:
- API key not set or invalid format
- PROVIDER_FIXED specifies unavailable provider
- PROVIDER_WEIGHTS includes provider without API key

---

### High Error Rate

**Check**:
```bash
railway logs | grep -i "rate limit\|timeout"
```

**Common Issues**:
- `RATE_LIMIT` too high for provider tier
- `TIMEOUT` too low for image processing
- Provider API quota exceeded

---

**Last Updated**: 1 Aralık 2025
**Maintainer**: Platform Team
**Related**: [Phase 1 Implementation](./README.md)
