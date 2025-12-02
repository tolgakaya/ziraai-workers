# Tomorrow's Quick Start Guide (2 Aralık 2025)

**Session Goal**: Implement raw-analysis-queue + Dispatcher + Worker updates (PHASE 1 Day 5)

---

## 🎯 Quick Context

### What We Completed Today (1 Aralık 2025)
✅ Response field preservation (spread operator)
✅ Multi-image queue support
✅ Exact N8N prompt match (216 lines, ZERO changes)
✅ Multi-provider model configuration fix
✅ 6 successful Railway deployments

### Current Architecture (Working)
```
WebAPI → [plant-analysis-requests, plant-analysis-multi-image-requests]
         ↓
    Worker Pool (consumes both queues)
         ↓ (FIXED strategy → openai)
    Provider Selection
         ↓
    OpenAI API (gpt-5-mini-2025-08-07)
         ↓
    analysis-results queue
```

### Target Architecture (Tomorrow's Goal)
```
WebAPI → raw-analysis-queue (NEW)
         ↓
    Dispatcher (TypeScript) (NEW)
         ↓
    [openai-queue, gemini-queue, anthropic-queue]
         ↓
    Worker Pool (consumes provider queues)
         ↓
    analysis-results queue
```

---

## 📋 Tomorrow's Tasks (In Order)

### Task 1: WebAPI Raw Analysis Queue
**Goal**: WebAPI publishes to `raw-analysis-queue` instead of direct provider queues

**Files to Modify**:
1. `Core/Configuration/RabbitMQOptions.cs` - Add RawAnalysisRequest queue
2. `Business/Services/PlantAnalysisAsyncService.cs` - Add feature flag + routing
3. `appsettings.json` - Add queue config + feature flag

**Success**: WebAPI publishes to `raw-analysis-queue` successfully

---

### Task 2: Dispatcher Service
**Goal**: Create dispatcher that routes from raw queue to provider queues

**New Project**: `workers/dispatcher/`

**Files to Create**:
- `src/index.ts` - Main entry
- `src/dispatcher.ts` - Routing logic
- `src/types/config.ts` - Config types
- `package.json` - Dependencies
- `Dockerfile` - Deployment

**Initial Logic**: FIXED strategy (always route to openai-queue)

**Success**: Dispatcher consumes raw queue, publishes to openai-queue

---

### Task 3: Worker Queue Update
**Goal**: Workers consume from provider-specific queues (not WebAPI queues)

**Files to Modify**:
- `workers/analysis-worker/src/index.ts` - Change queue consumption

**Before**:
```typescript
const singleImageQueue = config.rabbitmq.queues.plantAnalysisRequest;
const multiImageQueue = config.rabbitmq.queues.plantAnalysisMultiImageRequest;
```

**After**:
```typescript
const queues = [
  config.rabbitmq.queues.openai,
  config.rabbitmq.queues.gemini,
  config.rabbitmq.queues.anthropic
];
```

**Success**: Worker receives messages from provider-specific queues

---

### Task 4: End-to-End Testing
**Goal**: Verify complete flow works

**Test Sequence**:
1. Send 10 test requests from mobile/Postman
2. Verify WebAPI publishes to `raw-analysis-queue`
3. Verify Dispatcher consumes and routes to `openai-analysis-queue`
4. Verify Worker processes from `openai-analysis-queue`
5. Verify results appear in `analysis-results` queue
6. Verify PlantAnalysisWorkerService saves to PostgreSQL

**Success**: 10/10 analyses complete end-to-end

---

### Task 5: Documentation Update
**Goal**: Update completion summary

**Files to Update**:
- `PHASE1_COMPLETION_SUMMARY.md` - Add Day 5 completion
- `CURRENT_PROGRESS_AND_ROADMAP.md` - Update progress

**Success**: Documentation reflects Day 5 completion

---

## 🔑 Key Implementation Details

### WebAPI Feature Flag
```csharp
// PlantAnalysisAsyncService.cs
private readonly bool _useRawAnalysisQueue = true; // NEW system

public async Task PublishAsync(...)
{
    var queueName = _useRawAnalysisQueue
        ? _rabbitMQOptions.Queues.RawAnalysisRequest  // NEW
        : _rabbitMQOptions.Queues.PlantAnalysisRequest; // OLD

    await _publisher.PublishAsync(queueName, request);
}
```

### Dispatcher Routing Logic (FIXED Strategy)
```typescript
// dispatcher.ts
await rabbitmq.consumeQueue('raw-analysis-queue', async (message) => {
  // FIXED strategy for initial implementation
  const provider = 'openai';
  const targetQueue = 'openai-analysis-queue';

  await rabbitmq.publishToQueue(targetQueue, message);
  await rabbitmq.ack(message);
});
```

### Worker Queue Consumption
```typescript
// index.ts
const queues = [
  config.rabbitmq.queues.openai,    // openai-analysis-queue
  config.rabbitmq.queues.gemini,    // gemini-analysis-queue (future)
  config.rabbitmq.queues.anthropic  // anthropic-analysis-queue (future)
];

for (const queue of queues) {
  await rabbitmq.consumeQueue(queue, processMessage);
}
```

---

## ✅ Success Criteria (Day 5)

### Technical
- [ ] WebAPI publishes to `raw-analysis-queue`
- [ ] Dispatcher consumes from `raw-analysis-queue` without errors
- [ ] Dispatcher publishes to `openai-analysis-queue`
- [ ] Worker receives messages from `openai-analysis-queue`
- [ ] End-to-end test: 10 analyses complete
- [ ] No messages stuck in any queue
- [ ] Feature flag toggle works (OLD ↔ NEW system)
- [ ] TypeScript build: 0 errors

### Business
- [ ] Response time remains ~70 seconds
- [ ] ALL fields preserved (risk_assessment, etc.)
- [ ] Exact N8N prompt behavior maintained
- [ ] Multi-image support still works
- [ ] Cost tracking functional

---

## 🚨 Important Reminders

### User's Key Decision
"hayır alternatif istemiyorum. Mevcut planımız raw requets queue idi değil mi, aynı şekilde na aplana sadık kalacağız"

**Translation**: We MUST stick to original plan (raw-analysis-queue → Dispatcher → Provider queues)

### Critical Principles
1. **No shortcuts** - Implement exactly as planned
2. **Feature flag** - Allow toggle between OLD/NEW system
3. **Test thoroughly** - End-to-end flow validation required
4. **Document everything** - Update progress docs after completion

---

## 📚 Reference Documents

### Today's Work
- [CURRENT_PROGRESS_AND_ROADMAP.md](./CURRENT_PROGRESS_AND_ROADMAP.md) - Complete progress tracking
- [PHASE1_DAY4_CRITICAL_FIXES.md](./PHASE1_DAY4_CRITICAL_FIXES.md) - Today's 6 fixes

### Original Plan
- [PRODUCTION_READINESS_IMPLEMENTATION_PLAN.md](./PRODUCTION_READINESS_IMPLEMENTATION_PLAN.md) - Master plan (lines 122-138 for target architecture)

### Phase 1 Documentation
- [PHASE1_DAY1_TYPESCRIPT_WORKER_IMPLEMENTATION.md](./PHASE1_DAY1_TYPESCRIPT_WORKER_IMPLEMENTATION.md)
- [PHASE1_DAY2_MULTI_PROVIDER_IMPLEMENTATION.md](./PHASE1_DAY2_MULTI_PROVIDER_IMPLEMENTATION.md)
- [PHASE1_DAY3_4_RABBITMQ_SETUP.md](./PHASE1_DAY3_4_RABBITMQ_SETUP.md)

---

## 🔧 Environment Setup (Railway Staging)

### Current Environment (Working)
```bash
# Worker
WORKER_ID=openai-worker-001
CONCURRENCY=5
PROVIDER_MODEL=gpt-5-mini-2025-08-07
GEMINI_MODEL=gemini-2.0-flash-exp
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=openai

# RabbitMQ
RABBITMQ_URL=amqps://***
RESULT_QUEUE=plant-analysis-results
DLQ_QUEUE=analysis-dlq
```

### Additional Config Needed Tomorrow
```bash
# Dispatcher (NEW)
DISPATCHER_ID=dispatcher-001
RAW_ANALYSIS_QUEUE=raw-analysis-queue
OPENAI_QUEUE=openai-analysis-queue
GEMINI_QUEUE=gemini-analysis-queue
ANTHROPIC_QUEUE=anthropic-analysis-queue
DEFAULT_PROVIDER=openai
```

---

## 📊 Expected Timeline (Day 5)

| Task | Duration | Dependencies |
|------|----------|--------------|
| WebAPI raw-analysis-queue | 1-2 hours | None |
| Dispatcher service | 2-3 hours | WebAPI complete |
| Worker queue update | 1 hour | Dispatcher complete |
| End-to-end testing | 1-2 hours | All complete |
| Documentation update | 30 mins | Testing complete |

**Total Estimated Time**: 6-8 hours (full day)

---

## 🎯 End of Day 5 Goal

At the end of tomorrow, we should have:
✅ WebAPI publishing to `raw-analysis-queue` (with feature flag)
✅ Dispatcher routing to `openai-analysis-queue`
✅ Worker consuming from provider-specific queues
✅ End-to-end flow working (10+ successful analyses)
✅ Documentation updated

**Next**: Day 6-7 - Load testing and refinement

---

**Prepared**: 1 Aralık 2025
**For Session**: 2 Aralık 2025
**Status**: Ready to start Day 5 implementation
