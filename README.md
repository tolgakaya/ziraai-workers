# Ziraai Workers

TypeScript/Node.js worker services for Ziraai AI platform.

## 📁 Repository Structure

```
ziraai-workers/
├── analysis-worker/          # Multi-provider AI analysis worker
│   ├── src/
│   │   ├── providers/        # AI provider implementations
│   │   ├── services/         # Core services
│   │   └── types/            # TypeScript types
│   ├── scripts/              # Deployment scripts
│   ├── Dockerfile            # Production deployment
│   ├── railway.json          # Railway configuration
│   └── package.json
├── shared/                   # Shared types and utilities
│   └── types/                # Common TypeScript types
└── claudedocs/               # Documentation
    └── PlatformModernization/ # Platform modernization docs
```

## 🚀 Workers

### Analysis Worker (TypeScript)

Multi-provider AI plant analysis worker with support for:
- **OpenAI GPT-4o-mini** ($0.513/1M tokens)
- **Google Gemini Flash 2.0** ($0.108/1M tokens)
- **Anthropic Claude 3.5 Sonnet** ($4.80/1M tokens)

**Features**:
- 6 provider selection strategies (FIXED, ROUND_ROBIN, COST_OPTIMIZED, etc.)
- Multi-queue RabbitMQ consumption
- Dynamic provider metadata
- Rate limiting and retry logic
- Structured logging with Pino
- Cost optimization (66.7% savings)

**Tech Stack**:
- TypeScript + Node.js 18
- RabbitMQ (message queue)
- Redis (caching)
- Pino (logging)

## 📚 Documentation

Complete implementation documentation available in [claudedocs/PlatformModernization/](./claudedocs/PlatformModernization/):

- **[README.md](./claudedocs/PlatformModernization/README.md)** - Overview and timeline
- **[PHASE1_DAY1_TYPESCRIPT_WORKER_IMPLEMENTATION.md](./claudedocs/PlatformModernization/PHASE1_DAY1_TYPESCRIPT_WORKER_IMPLEMENTATION.md)** - TypeScript worker setup
- **[PHASE1_DAY2_MULTI_PROVIDER_IMPLEMENTATION.md](./claudedocs/PlatformModernization/PHASE1_DAY2_MULTI_PROVIDER_IMPLEMENTATION.md)** - Multi-provider implementation
- **[PHASE1_DAY3_4_RABBITMQ_SETUP.md](./claudedocs/PlatformModernization/PHASE1_DAY3_4_RABBITMQ_SETUP.md)** - RabbitMQ multi-queue setup
- **[RAILWAY_STAGING_DEPLOYMENT.md](./claudedocs/PlatformModernization/RAILWAY_STAGING_DEPLOYMENT.md)** - Railway deployment guide
- **[PROVIDER_SELECTION_STRATEGIES.md](./claudedocs/PlatformModernization/PROVIDER_SELECTION_STRATEGIES.md)** - Provider selection strategies
- **[PHASE1_COMPLETION_SUMMARY.md](./claudedocs/PlatformModernization/PHASE1_COMPLETION_SUMMARY.md)** - Phase 1 completion summary

## 🔧 Quick Start

### Prerequisites

- Node.js 18+
- RabbitMQ
- Redis
- API keys for at least one provider (OpenAI, Gemini, or Anthropic)

### Local Development

```bash
# Navigate to analysis-worker
cd analysis-worker

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Required: WORKER_ID, RABBITMQ_URL, REDIS_URL
# Required: At least one of OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY

# Build TypeScript
npm run build

# Start worker
npm start
```

### Environment Variables

```bash
# Worker Configuration
WORKER_ID=worker-dev-1
NODE_ENV=development

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# Redis
REDIS_URL=redis://localhost:6379

# AI Provider API Keys (at least one required)
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...

# Provider Selection Strategy
PROVIDER_SELECTION_STRATEGY=COST_OPTIMIZED
```

## 🚀 Railway Deployment

### Prerequisites

1. GitHub repository: `ziraai-workers`
2. Railway account connected to GitHub
3. Environment variables configured

### Deployment Steps

1. **Create Railway Service**:
   - Railway Dashboard → New Project
   - Deploy from GitHub → `ziraai-workers`
   - Railway auto-detects `railway.json`

2. **Configure Environment Variables**:
   - Add all required variables in Railway dashboard
   - See [RAILWAY_STAGING_DEPLOYMENT.md](./claudedocs/PlatformModernization/RAILWAY_STAGING_DEPLOYMENT.md) for complete list

3. **Deploy**:
   - Push to GitHub triggers automatic deployment
   - Railway builds Docker image
   - Zero-downtime deployment

### Validation

```bash
# Pre-deployment validation
node analysis-worker/scripts/validate-deployment.js

# Expected output:
# ✅ 26/26 checks passed
# Status: READY FOR DEPLOYMENT
```

## 📊 Cost Analysis

### Monthly Cost Comparison (1M analyses/day)

| Strategy | Daily Cost | Monthly Cost | Savings vs OpenAI |
|----------|-----------|--------------|-------------------|
| COST_OPTIMIZED | $171 | $5,134 | 66.7% ($10,256) |
| 100% OpenAI | $513 | $15,390 | Baseline |
| QUALITY_FIRST | $4,582 | $137,460 | -792% |

**Recommended**: COST_OPTIMIZED strategy with Gemini primary (95% success rate).

## 🔍 Provider Selection Strategies

1. **FIXED** - Single provider only
2. **ROUND_ROBIN** - Rotate between providers
3. **COST_OPTIMIZED** - Cheapest provider first (recommended)
4. **QUALITY_FIRST** - Best quality provider first
5. **MESSAGE_BASED** - Provider specified in message metadata
6. **WEIGHTED** - Weighted distribution across providers

See [PROVIDER_SELECTION_STRATEGIES.md](./claudedocs/PlatformModernization/PROVIDER_SELECTION_STRATEGIES.md) for detailed documentation.

## 🏗️ Architecture

### Queue Architecture

```
RabbitMQ Queues:
├─ openai-analysis-queue      → OpenAI GPT-4o-mini requests
├─ gemini-analysis-queue      → Google Gemini Flash 2.0 requests
├─ anthropic-analysis-queue   → Claude 3.5 Sonnet requests
├─ analysis-results-queue     → Completed analysis results
└─ analysis-dlq               → Failed/dead-letter messages
```

### Worker Behavior

- Each worker instance consumes from **ALL** provider-specific queues
- Provider selection strategy determines which AI provider processes each message
- Horizontal scaling: Add more workers for higher throughput

## 📈 Scaling

| Replicas | Daily Volume | Monthly Cost |
|----------|-------------|--------------|
| 1 | 10,000 | $10 |
| 3 | 100,000 | $30 |
| 6 | 500,000 | $60 |
| 12 | 1,000,000 | $120 |

**Formula**: Daily Capacity ≈ Replicas × 86,400 analyses (at PREFETCH_COUNT=60)

## 🤝 Contributing

This is a private repository for Ziraai platform worker services.

## 📄 License

Proprietary - Ziraai AI Platform

---

**Related Repositories**:
- Main API: [ziraaiv1](https://github.com/tolgakaya/ziraaiv1)

**Documentation**: See [claudedocs/PlatformModernization/](./claudedocs/PlatformModernization/)

**Last Updated**: 30 Kasım 2025
