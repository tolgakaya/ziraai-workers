# Phase 1 Day 5: Deployment Validation Guide

**Date**: 2 Aralık 2025
**Status**: Implementation Complete - Ready for Testing
**Objective**: Validate raw-analysis-queue → Dispatcher → Provider queues architecture

---

## ✅ Implementation Complete (Tasks 1-4)

### Task 1: WebAPI Raw Analysis Queue ✅
**Files Modified:**
- `Core/Configuration/RabbitMQOptions.cs` - Added `RawAnalysisRequest` queue
- `Business/Services/PlantAnalysis/PlantAnalysisAsyncService.cs` - Feature flag implementation
- `Business/Services/PlantAnalysis/PlantAnalysisMultiImageAsyncService.cs` - Feature flag implementation
- `WebAPI/appsettings.Development.json` - Configuration added

**Feature Flag:**
```json
{
  "PlantAnalysis": {
    "UseRawAnalysisQueue": false  // Toggle: false=OLD, true=NEW
  },
  "RabbitMQ": {
    "Queues": {
      "RawAnalysisRequest": "raw-analysis-queue"
    }
  }
}
```

**Build Status**: ✅ 0 errors, 0 warnings

---

### Task 2 & 3: Dispatcher Service ✅
**New Project**: `workers/dispatcher/`

**Structure:**
```
workers/dispatcher/
├── src/
│   ├── types/config.ts
│   ├── dispatcher.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── Dockerfile
└── .env.example
```

**Features:**
- FIXED strategy routing (openai/gemini/anthropic)
- Consumes from `raw-analysis-queue`
- Publishes to provider-specific queues
- Dead Letter Queue (DLQ) support
- Graceful shutdown handling

**Build Status**: ✅ 0 errors, 27 dependencies

---

### Task 4: Worker Queue Update ✅
**File Modified**: `workers/analysis-worker/src/index.ts`

**Feature Flag**: `USE_PROVIDER_QUEUES` (environment variable)

**Queue Modes:**
- `USE_PROVIDER_QUEUES=false` (default): OLD system - consumes from WebAPI queues
- `USE_PROVIDER_QUEUES=true`: NEW system - consumes from provider-specific queues

**Build Status**: ✅ 0 errors

---

## 🧪 End-to-End Testing (Task 5)

### Test Scenarios

#### **Scenario 1: OLD System (Baseline)**
Verify existing system still works without any changes.

**Configuration:**
- WebAPI: `UseRawAnalysisQueue = false`
- Worker: `USE_PROVIDER_QUEUES = false`

**Flow:**
```
WebAPI → plant-analysis-requests
       → plant-analysis-multi-image-requests
           ↓
       Worker Pool (direct consumption)
           ↓
       plant-analysis-results
```

**Validation Steps:**
1. Start Worker: `cd workers/analysis-worker && npm start`
2. Send 10 test requests via Postman/Mobile
3. Verify all 10 analyses complete successfully
4. Verify response times (~70 seconds)
5. Verify ALL fields preserved (risk_assessment, etc.)

**Success Criteria:**
- ✅ 10/10 requests processed
- ✅ Average response time ~70 seconds
- ✅ All response fields present
- ✅ PostgreSQL records created

---

#### **Scenario 2: NEW System (Full Architecture)**
Test complete new architecture with Dispatcher.

**Configuration:**
- WebAPI: `UseRawAnalysisQueue = true`
- Dispatcher: `PROVIDER_SELECTION_STRATEGY = FIXED`, `PROVIDER_FIXED = openai`
- Worker: `USE_PROVIDER_QUEUES = true`

**Flow:**
```
WebAPI → raw-analysis-queue
           ↓
       Dispatcher (FIXED → openai)
           ↓
       openai-analysis-queue
           ↓
       Worker Pool
           ↓
       plant-analysis-results
```

**Validation Steps:**
1. Start Dispatcher: `cd workers/dispatcher && npm start`
2. Start Worker: `cd workers/analysis-worker && npm start`
3. Update WebAPI config: `PlantAnalysis:UseRawAnalysisQueue = true`
4. Restart WebAPI
5. Send 10 test requests via Postman/Mobile
6. Monitor logs:
   - WebAPI: Publishing to `raw-analysis-queue`
   - Dispatcher: Routing to `openai-analysis-queue`
   - Worker: Consuming from `openai-analysis-queue`
7. Verify all 10 analyses complete successfully

**Success Criteria:**
- ✅ 10/10 requests processed
- ✅ Average response time ~70 seconds
- ✅ All response fields present
- ✅ Dispatcher logs show routing
- ✅ Worker logs show provider queue consumption
- ✅ No messages stuck in queues

---

#### **Scenario 3: Multi-Image Support**
Verify multi-image requests work with new architecture.

**Configuration:**
- WebAPI: `UseRawAnalysisQueue = true`
- Dispatcher: `PROVIDER_FIXED = openai`
- Worker: `USE_PROVIDER_QUEUES = true`

**Test Data:**
- Main image + 4 optional images (leaf top, leaf bottom, plant overview, root)

**Validation Steps:**
1. Send 5 multi-image requests
2. Verify all 5 images processed per request
3. Verify image URLs in response
4. Verify analysis quality

**Success Criteria:**
- ✅ 5/5 multi-image requests processed
- ✅ All image URLs present in response
- ✅ Analysis considers all images

---

#### **Scenario 4: Provider Switching**
Test Dispatcher routing to different providers.

**Test Runs:**
1. **OpenAI**: `PROVIDER_FIXED=openai`
   - Send 5 requests
   - Verify `openai-analysis-queue` consumption

2. **Gemini**: `PROVIDER_FIXED=gemini`
   - Restart Dispatcher with new config
   - Send 5 requests
   - Verify `gemini-analysis-queue` consumption

3. **Anthropic**: `PROVIDER_FIXED=anthropic`
   - Restart Dispatcher with new config
   - Send 5 requests
   - Verify `anthropic-analysis-queue` consumption

**Success Criteria:**
- ✅ Dispatcher routes to correct queue based on config
- ✅ Workers consume from correct provider queue
- ✅ All requests processed successfully

---

#### **Scenario 5: Error Handling**
Test DLQ and error scenarios.

**Test Cases:**
1. **Invalid JSON in raw queue**
   - Manually publish malformed message
   - Verify Dispatcher sends to DLQ
   - Verify original message preserved

2. **Provider queue not found**
   - Configure invalid provider
   - Verify Dispatcher fallback behavior

3. **Worker unavailable**
   - Stop all workers
   - Publish messages
   - Restart workers
   - Verify messages processed

**Success Criteria:**
- ✅ Invalid messages go to DLQ
- ✅ Dispatcher handles errors gracefully
- ✅ Messages not lost during failures

---

## 🚀 Deployment Sequence

### Local Testing (Development)

**Step 1: Update Configuration**
```bash
# WebAPI: appsettings.Development.json
"PlantAnalysis": {
  "UseRawAnalysisQueue": true
}
```

**Step 2: Start Services (in order)**
```bash
# Terminal 1: Start Dispatcher
cd workers/dispatcher
npm install
npm run build
npm start

# Terminal 2: Start Worker (with new queue mode)
cd workers/analysis-worker
npm install
npm run build
USE_PROVIDER_QUEUES=true npm start

# Terminal 3: Start WebAPI
cd ../..
dotnet run --project WebAPI/WebAPI.csproj
```

**Step 3: Verify Services**
- Dispatcher logs: "Consuming from raw-analysis-queue"
- Worker logs: "Using NEW queue system: Provider-specific queues"
- WebAPI logs: "RabbitMQ connected"

---

### Railway Staging Deployment

**Prerequisites:**
- RabbitMQ CloudAMQP instance (existing)
- PostgreSQL database (existing)
- Redis instance (existing)

**Deployment Order:**

**1. Deploy Dispatcher (NEW SERVICE)**
```bash
# Create new Railway service
railway init -n ziraai-dispatcher-staging

# Set environment variables
DISPATCHER_ID=dispatcher-staging-001
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=openai
RABBITMQ_URL=[your-cloudamqp-url]
RAW_ANALYSIS_QUEUE=raw-analysis-queue
OPENAI_QUEUE=openai-analysis-queue
GEMINI_QUEUE=gemini-analysis-queue
ANTHROPIC_QUEUE=anthropic-analysis-queue
DLQ_QUEUE=analysis-dlq

# Deploy
git add workers/dispatcher
git commit -m "feat: Add Dispatcher service for queue routing (Phase 1 Day 5)"
railway up
```

**2. Update Worker Configuration**
```bash
# Add new environment variable to existing worker service
USE_PROVIDER_QUEUES=true

# Redeploy worker
railway redeploy -s ziraai-worker-staging
```

**3. Update WebAPI Configuration**
```bash
# Add environment variable to WebAPI service
PLANTANALYSIS__USERAWANALYSISQUEUE=true

# Redeploy WebAPI
railway redeploy -s ziraai-api-staging
```

**4. Verification**
- Check Railway logs for all 3 services
- Send test requests
- Monitor queue depths in CloudAMQP
- Verify PostgreSQL records

---

## 📊 Monitoring Checklist

### RabbitMQ CloudAMQP
- [ ] `raw-analysis-queue` exists
- [ ] `openai-analysis-queue` exists
- [ ] `gemini-analysis-queue` exists
- [ ] `anthropic-analysis-queue` exists
- [ ] `analysis-dlq` exists
- [ ] Message flow: raw → openai → 0 (consumed)
- [ ] No stuck messages (> 5 minutes old)

### Railway Logs
- [ ] Dispatcher: "Routed {AnalysisId} to openai-analysis-queue"
- [ ] Worker: "Using NEW queue system: Provider-specific queues"
- [ ] WebAPI: Publishing to raw-analysis-queue (when UseRawAnalysisQueue=true)

### PostgreSQL
- [ ] PlantAnalysis records created
- [ ] AnalysisStatus = "Completed"
- [ ] All fields populated (risk_assessment, etc.)
- [ ] ImageUrl fields populated

### Response Validation
- [ ] HTTP 200 status
- [ ] AnalysisId returned
- [ ] All response fields present
- [ ] Response time ~70 seconds

---

## 🔄 Rollback Plan

### If NEW System Fails

**Immediate Rollback (< 1 minute):**
```bash
# WebAPI: Set environment variable
PLANTANALYSIS__USERAWANALYSISQUEUE=false

# Worker: Set environment variable
USE_PROVIDER_QUEUES=false

# Restart services
railway redeploy -s ziraai-api-staging
railway redeploy -s ziraai-worker-staging

# Stop Dispatcher (optional, won't receive messages)
railway service:delete ziraai-dispatcher-staging
```

**System reverts to:**
```
WebAPI → plant-analysis-requests
       → plant-analysis-multi-image-requests
           ↓
       Worker Pool (direct)
           ↓
       plant-analysis-results
```

**No data loss**: Messages already in provider queues will be consumed when workers restart in OLD mode (they also listen to old queues).

---

## 📋 Success Criteria Summary

### Technical Metrics
- [ ] Build: 0 TypeScript errors
- [ ] Build: 0 C# errors
- [ ] Dispatcher: Successfully routes to provider queues
- [ ] Worker: Successfully consumes from provider queues
- [ ] End-to-end: 10/10 test requests complete
- [ ] Response time: ~70 seconds average
- [ ] Feature flag toggle: OLD ↔ NEW works

### Business Metrics
- [ ] ALL response fields preserved
- [ ] Multi-image support functional
- [ ] Exact N8N prompt behavior maintained
- [ ] Cost tracking operational
- [ ] No data loss during transition

### Deployment Metrics
- [ ] Railway Staging: 3 services deployed
- [ ] RabbitMQ: All queues created
- [ ] Logs: Clear routing visibility
- [ ] Monitoring: Queue depths normal
- [ ] Rollback: < 1 minute if needed

---

## 📝 Next Steps (After Validation)

1. **Day 6-7**: Load testing
   - 100 concurrent requests
   - 1000 requests over 1 hour
   - Provider failover testing

2. **Day 8-10**: Production preparation
   - Update PHASE1_COMPLETION_SUMMARY.md
   - Update CURRENT_PROGRESS_AND_ROADMAP.md
   - Create Railway Production deployment plan

3. **Phase 2**: Advanced routing strategies
   - ROUND_ROBIN implementation
   - COST_OPTIMIZED strategy
   - LATENCY_OPTIMIZED strategy
   - Dynamic provider selection

---

**Prepared**: 2 Aralık 2025
**Implementation**: Complete (Tasks 1-4)
**Status**: Ready for End-to-End Testing (Task 5)
**Build Status**: ✅ All projects building successfully
