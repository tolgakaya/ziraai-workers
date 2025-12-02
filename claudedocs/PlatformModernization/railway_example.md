🔧 Environment Variables - Complete Reference
1️⃣ Dispatcher Service (workers/dispatcher/)
Temel Konfigürasyon
# Service Identification
DISPATCHER_ID=dispatcher-001                    # Dispatcher instance ID

# Node Environment
NODE_ENV=production                             # development | production
Provider Selection Strategy
# Strategy Type (Phase 1: FIXED only)
PROVIDER_SELECTION_STRATEGY=FIXED               # FIXED | ROUND_ROBIN | COST_OPTIMIZED | LATENCY_OPTIMIZED

# Fixed Provider (only when strategy=FIXED)
PROVIDER_FIXED=openai                           # openai | gemini | anthropic
RabbitMQ Configuration
# Connection
RABBITMQ_URL=amqps://user:pass@host.cloudamqp.com/vhost

# Queue Names
RAW_ANALYSIS_QUEUE=raw-analysis-queue           # Input queue (from WebAPI)
OPENAI_QUEUE=openai-analysis-queue              # OpenAI routing queue
GEMINI_QUEUE=gemini-analysis-queue              # Gemini routing queue
ANTHROPIC_QUEUE=anthropic-analysis-queue        # Anthropic routing queue
DLQ_QUEUE=analysis-dlq                          # Dead Letter Queue

# Retry Settings
MAX_RETRY_ATTEMPTS=3                            # Retry attempts for failed routing
RETRY_DELAY_MS=1000                             # Delay between retries (ms)
Railway Deployment Example
# Railway Staging Configuration
DISPATCHER_ID=dispatcher-staging-001
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=openai
RABBITMQ_URL=amqps://xxx:yyy@goose.rmq2.cloudamqp.com/zzz
RAW_ANALYSIS_QUEUE=raw-analysis-queue
OPENAI_QUEUE=openai-analysis-queue
GEMINI_QUEUE=gemini-analysis-queue
ANTHROPIC_QUEUE=anthropic-analysis-queue
DLQ_QUEUE=analysis-dlq
NODE_ENV=production
2️⃣ Analysis Worker (workers/analysis-worker/)
Temel Konfigürasyon
# Worker Identification
WORKER_ID=analysis-worker-001                   # Worker instance ID
NODE_ENV=development                            # development | production
LOG_LEVEL=info                                  # debug | info | warn | error

# Performance
CONCURRENCY=60                                  # Max concurrent requests
HEALTH_CHECK_INTERVAL=30000                     # Health check interval (ms)
TIMEOUT=60000                                   # Request timeout (ms)
RATE_LIMIT=350                                  # Rate limit per minute
🆕 Queue System Selection (Day 5)
# CRITICAL: Toggle between OLD and NEW architecture
USE_PROVIDER_QUEUES=false                       # false=OLD (WebAPI direct) | true=NEW (Dispatcher)

# false (default) - OLD System:
#   Consumes: plant-analysis-requests, plant-analysis-multi-image-requests
#   Flow: WebAPI → Worker (direct)
#
# true - NEW System:
#   Consumes: openai-analysis-queue, gemini-analysis-queue, anthropic-analysis-queue
#   Flow: WebAPI → Dispatcher → Worker
#
# NOTE: Must match WebAPI's PlantAnalysis:UseRawAnalysisQueue setting
Provider API Keys
# At least ONE provider required
OPENAI_API_KEY=sk-proj-...                      # OpenAI API key
GEMINI_API_KEY=AIza...                          # Google Gemini API key
ANTHROPIC_API_KEY=sk-ant-...                    # Anthropic API key
Provider Models
# OpenAI Model
PROVIDER_MODEL=gpt-4o-mini                      # gpt-4o-mini | gpt-4o | o1-preview

# Gemini Model
GEMINI_MODEL=gemini-2.0-flash-exp               # gemini-2.0-flash-exp | gemini-1.5-pro

# Anthropic Model
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022      # claude-3-5-sonnet-20241022 | claude-3-opus-20240229
Provider Selection Strategy
PROVIDER_SELECTION_STRATEGY=ROUND_ROBIN         # FIXED | ROUND_ROBIN | COST_OPTIMIZED | QUALITY_FIRST | MESSAGE_BASED | WEIGHTED

# For FIXED strategy
PROVIDER_FIXED=gemini                           # openai | gemini | anthropic

# For WEIGHTED strategy
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":70},{"provider":"openai","weight":20},{"provider":"anthropic","weight":10}]

# Dynamic Metadata (optional)
PROVIDER_METADATA={"gemini":{"costPerMillion":1.0,"qualityScore":7},"openai":{"costPerMillion":5.0,"qualityScore":8}}
RabbitMQ Configuration
# Connection
RABBITMQ_URL=amqp://localhost:5672

# Result and Error Queues
RESULT_QUEUE=plant-analysis-results             # Results queue (to WebAPI)
DLQ_QUEUE=analysis-dlq                          # Dead Letter Queue

# Message Processing
PREFETCH_COUNT=10                               # Messages to prefetch
Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=ziraai:ratelimit:
REDIS_TTL=120
Railway Deployment Example - OLD System
# Worker consuming from WebAPI queues (backward compatible)
WORKER_ID=worker-staging-001
USE_PROVIDER_QUEUES=false                       # ← OLD system
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=openai
OPENAI_API_KEY=sk-proj-xxx
PROVIDER_MODEL=gpt-4o-mini
RABBITMQ_URL=amqps://xxx:yyy@goose.rmq2.cloudamqp.com/zzz
RESULT_QUEUE=plant-analysis-results
DLQ_QUEUE=analysis-dlq
REDIS_URL=redis://default:xxx@singular-joey-24224.upstash.io:6379
CONCURRENCY=5
NODE_ENV=production
Railway Deployment Example - NEW System
# Worker consuming from Dispatcher provider queues
WORKER_ID=worker-staging-001
USE_PROVIDER_QUEUES=true                        # ← NEW system
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=openai
OPENAI_API_KEY=sk-proj-xxx
PROVIDER_MODEL=gpt-4o-mini
RABBITMQ_URL=amqps://xxx:yyy@goose.rmq2.cloudamqp.com/zzz
RESULT_QUEUE=plant-analysis-results
DLQ_QUEUE=analysis-dlq
REDIS_URL=redis://default:xxx@singular-joey-24224.upstash.io:6379
CONCURRENCY=5
NODE_ENV=production
📋 Quick Reference: System Toggle
OLD System (Backward Compatible)
# WebAPI
PlantAnalysis:UseRawAnalysisQueue = false

# Dispatcher
# (Not running)

# Worker
USE_PROVIDER_QUEUES = false
Flow: WebAPI → plant-analysis-requests → Worker → OpenAI
NEW System (Day 5 Architecture)
# WebAPI
PlantAnalysis:UseRawAnalysisQueue = true

# Dispatcher
PROVIDER_SELECTION_STRATEGY = FIXED
PROVIDER_FIXED = openai

# Worker
USE_PROVIDER_QUEUES = true
Flow: WebAPI → raw-analysis-queue → Dispatcher → openai-analysis-queue → Worker → OpenAI
🎯 Railway Deployment Checklist
Dispatcher Service (NEW)
 DISPATCHER_ID="ziraai-dispatcher-staging-1"
 PROVIDER_SELECTION_STRATEGY="FIXED"
 PROVIDER_FIXED="openai"
 RABBITMQ_URL="amqp://DIjL9Z7auxVvnQTYnO9mY0@rabbitmq.railway.internal:5672"
 RAW_ANALYSIS_QUEUE="raw-analysis-queue"
 OPENAI_QUEUE="openai-analysis-queue"
 GEMINI_QUEUE="gemini-analysis-queue"
 ANTHROPIC_QUEUE="anthropic-analysis-queue"
 DLQ_QUEUE="analysis-dlq"
 NODE_ENV="staging"
Worker Service (UPDATE)
 Add: USE_PROVIDER_QUEUES=true
 Keep: All existing environment variables
 Verify: At least one *_API_KEY present
WebAPI Service (UPDATE)
 Add: PLANTANALYSIS__USERAWANALYSISQUEUE=true
 Keep: All existing environment variables
İşte derli toplu environment variable listeleri! Her iki sistem (OLD/NEW) için de konfigürasyonlar hazır. 