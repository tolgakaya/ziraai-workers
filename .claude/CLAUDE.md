# Ziraai Workers - Claude Code Instructions

## 🎯 Repository Context

Bu repository, **Ziraai Workers** için ayrı bir git repository'sidir ve ana .NET projeden bağımsız olarak yönetilir.

### Repository Yapısı

```
ziraai/                                    # Ana .NET repository (ayrı git)
├── WebAPI/
├── PlantAnalysisWorkerService/
└── ... (diğer .NET projeleri)

ziraai-workers/                            # Workers repository (bu repo - ayrı git)
├── .git/                                  # Bu repo'nun git'i
├── analysis-worker/                       # TypeScript worker
├── claudedocs/                            # Worker-specific docs
└── README.md
```

## ⚠️ ÇOK ÖNEMLİ: Her Geliştirme Öncesi Oku

**KURAL**: Her yeni session'da veya geliştirme öncesinde şu dosyaları OKU:

1. **[README.md](../README.md)** - Repository overview ve quick start
2. **[claudedocs/PlatformModernization/README.md](../claudedocs/PlatformModernization/README.md)** - Proje timeline ve durum
3. **[PHASE1_COMPLETION_SUMMARY.md](../claudedocs/PlatformModernization/PHASE1_COMPLETION_SUMMARY.md)** - Tamamlanan işler

**Neden Önemli?**:
- Context'i kaybetmemek için
- Tamamlanan işleri tekrar yapmamak için
- Mevcut architecture'ı anlamak için
- Next steps'i bilmek için

## 🏗️ Project Architecture

### TypeScript Workers (Node.js 18)

**Mevcut Workers**:
- **analysis-worker**: Multi-provider AI analysis (OpenAI, Gemini, Anthropic)

**Tech Stack**:
- TypeScript
- Node.js 18
- RabbitMQ (message queue)
- Redis (caching)
- Pino (logging)

### Deployment

**Platform**: Railway
**Method**: Docker (multi-stage build)
**Files**:
- `analysis-worker/Dockerfile` - Production build
- `analysis-worker/railway.json` - Railway config
- `analysis-worker/.dockerignore` - Build optimization

## 📝 Development Workflow

### Adding New Workers

1. Create directory: `workers/new-worker/`
2. Initialize with:
   - `package.json`
   - `tsconfig.json`
   - `Dockerfile`
   - `railway.json`
   - `README.md`
3. Follow analysis-worker structure
4. Document in main README.md

### Making Changes

```bash
# 1. Read context (ALWAYS FIRST)
cat README.md
cat claudedocs/PlatformModernization/README.md

# 2. Make changes
cd analysis-worker
# ... edit files

# 3. Test locally
npm install
npm run build
npm start

# 4. Validate deployment
node scripts/validate-deployment.js

# 5. Commit & push
git add .
git commit -m "feat: description"
git push origin main
```

## 🚀 Railway Deployment

### Current Services

- **analysis-worker-staging**: Staging environment
- **analysis-worker-production**: Production environment (when ready)

### Environment Variables (Railway)

**Required**:
- `WORKER_ID`
- `RABBITMQ_URL`
- `REDIS_URL`
- At least one: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`
- `PROVIDER_SELECTION_STRATEGY`

**See**: [RAILWAY_STAGING_DEPLOYMENT.md](../claudedocs/PlatformModernization/RAILWAY_STAGING_DEPLOYMENT.md)

## 🔧 Common Commands

```bash
# Analysis Worker
cd analysis-worker
npm install              # Install dependencies
npm run build           # Build TypeScript
npm start               # Start worker
npm run dev             # Development mode (watch)

# Validation
node scripts/validate-deployment.js  # Pre-deployment checks

# Git (from workers/ root)
git status
git add .
git commit -m "message"
git push origin main
```

## 📚 Documentation Structure

```
claudedocs/
└── PlatformModernization/
    ├── README.md                              # Overview & timeline
    ├── PHASE1_DAY1_TYPESCRIPT_WORKER_IMPLEMENTATION.md
    ├── PHASE1_DAY2_MULTI_PROVIDER_IMPLEMENTATION.md
    ├── PHASE1_DAY3_4_RABBITMQ_SETUP.md
    ├── RAILWAY_STAGING_DEPLOYMENT.md          # Deployment guide
    ├── PROVIDER_SELECTION_STRATEGIES.md       # Strategy documentation
    ├── PHASE1_COMPLETION_SUMMARY.md           # What's done
    └── PRODUCTION_READINESS_IMPLEMENTATION_PLAN.md
```

## 🎯 Current Status (30 Kasım 2025)

**Phase 1 Complete**: ✅
- Day 1: TypeScript worker setup
- Day 2: Multi-provider implementation (OpenAI, Gemini, Anthropic)
- Day 3-4: RabbitMQ multi-queue setup
- Railway deployment ready

**Next Steps**: Phase 2 (WebAPI integration)
- Day 5-7: WebAPI değişiklikleri
- Day 8-10: Railway deployment & testing

## 🚨 Important Notes

### Repository Independence

- **Bu repo**: `ziraai-workers` (Node.js/TypeScript workers)
- **Ana repo**: `ziraaiv1` (C# .NET API & services)
- **İki repo birbirinden bağımsız**: Her biri kendi git history'si

### Don't Do

- ❌ Ana repo'dan kod kopyalama (sadece types paylaş)
- ❌ .NET projeleri ekleme (sadece Node.js/TypeScript)
- ❌ Main repo'nun Dockerfile'larını karıştırma

### Do

- ✅ Her worker için ayrı Dockerfile
- ✅ Shared types klasöründe ortak tipler
- ✅ Railway için basit deployment (tek Dockerfile per worker)
- ✅ Comprehensive documentation in claudedocs

## 🔐 Security

- **Never commit**: `.env` files, API keys, secrets
- **Always use**: `.env.example` for templates
- **Railway variables**: Set via Railway dashboard

## 📞 Main Repo Integration

**Message Queue**: RabbitMQ
- Ana .NET API → RabbitMQ → Workers
- Workers → RabbitMQ → Results → Ana .NET API

**Shared Infrastructure**:
- RabbitMQ (CloudAMQP on Railway)
- Redis (Railway plugin)
- PostgreSQL (ana repo'da, workers sadece results yazar)

---

**REMEMBER**: Always read README.md and claudedocs before starting new work!

**Repository**: https://github.com/tolgakaya/ziraai-workers
**Main Repo**: https://github.com/tolgakaya/ziraaiv1
