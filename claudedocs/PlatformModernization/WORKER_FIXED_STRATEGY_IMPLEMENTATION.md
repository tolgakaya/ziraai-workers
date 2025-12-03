# Worker FIXED Strategy Implementation

**Date**: 2025-12-03
**Status**: ✅ COMPLETED
**Impact**: Critical architectural simplification

## Overview

Enforced FIXED-only provider selection strategy in analysis workers to create specialized worker instances that consume from single provider-specific queues. This enables clean microservices architecture with independent scaling per provider.

## Problem

Workers were consuming from ALL three provider queues (openai-analysis-queue, gemini-analysis-queue, anthropic-analysis-queue) regardless of configured strategy, making dispatcher routing meaningless.

**Example Issue**:
```bash
# Worker Configuration
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=gemini
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-proj-...

# Problem: Worker consumed from BOTH queues
- gemini-analysis-queue ✅ (correct)
- openai-analysis-queue ❌ (incorrect - should not consume)
```

## Solution

### 1. Code Changes

**File**: `workers/analysis-worker/src/index.ts` (Lines 242-304)

#### Strategy Validation
```typescript
if (this.config.providerSelection.strategy !== 'FIXED') {
  throw new Error(
    `Worker strategy must be FIXED when USE_PROVIDER_QUEUES=true. ` +
    `Current strategy: ${this.config.providerSelection.strategy}. ` +
    `Set PROVIDER_SELECTION_STRATEGY=FIXED and PROVIDER_FIXED=<provider>`
  );
}
```

#### Provider Fixed Validation
```typescript
if (!this.config.providerSelection.fixedProvider) {
  throw new Error(
    'PROVIDER_FIXED must be set when PROVIDER_SELECTION_STRATEGY=FIXED. ' +
    'Set PROVIDER_FIXED to one of: openai, gemini, anthropic'
  );
}
```

#### Queue Mapping & Single Queue Consumption
```typescript
const queueMap: Record<string, string> = {
  'openai': this.config.rabbitmq.queues.openai,
  'gemini': this.config.rabbitmq.queues.gemini,
  'anthropic': this.config.rabbitmq.queues.anthropic,
};

const fixedQueue = queueMap[this.config.providerSelection.fixedProvider];

// Consume from single queue only
await this.rabbitmq.consumeQueue(fixedQueue, async (message) => {
  await this.processMessage(message);
});
```

### 2. Documentation Updates

#### Environment Variables Reference
**File**: `workers/claudedocs/PlatformModernization/ENVIRONMENT_VARIABLES_REFERENCE.md`

- Updated `PROVIDER_SELECTION_STRATEGY` → REQUIRED, FIXED only
- Updated `PROVIDER_FIXED` → REQUIRED, always
- Updated `PROVIDER_WEIGHTS` → Marked as dispatcher-only
- Added critical requirement warnings
- Removed ROUND_ROBIN, COST_OPTIMIZED, etc. examples for workers
- Added clear worker vs dispatcher configuration sections

#### Worker Configuration Template
**File**: `workers/analysis-worker/.env.example`

- Replaced multi-strategy examples with FIXED-only examples
- Added critical requirement warnings
- Updated deployment examples to show specialized worker architecture
- Clarified queue consumption behavior
- Removed outdated strategy documentation

## Architecture

### Specialized Worker Pattern

```
┌─────────────────────────────────────────────────────────────┐
│ Dispatcher (ROUND_ROBIN, COST_OPTIMIZED, etc.)            │
│ Consumes: raw-analysis-queue                                │
│ Routes to: openai-queue | gemini-queue | anthropic-queue   │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ OpenAI       │ │ Gemini       │ │ Anthropic    │
    │ Worker       │ │ Worker       │ │ Worker       │
    │ (FIXED)      │ │ (FIXED)      │ │ (FIXED)      │
    ├──────────────┤ ├──────────────┤ ├──────────────┤
    │ Queue:       │ │ Queue:       │ │ Queue:       │
    │ openai-      │ │ gemini-      │ │ anthropic-   │
    │ analysis-    │ │ analysis-    │ │ analysis-    │
    │ queue        │ │ queue        │ │ queue        │
    ├──────────────┤ ├──────────────┤ ├──────────────┤
    │ API Key:     │ │ API Key:     │ │ API Key:     │
    │ OpenAI only  │ │ Gemini only  │ │ Anthropic    │
    │              │ │              │ │ only         │
    └──────────────┘ └──────────────┘ └──────────────┘
         │                │                │
         └────────────────┼────────────────┘
                          ▼
              plant-analysis-results
```

### Benefits

1. **Clean Separation**: Each worker instance specialized for one provider
2. **Independent Scaling**: Scale worker replicas per provider based on load
3. **Cost Optimization**: Deploy more Gemini workers, fewer Anthropic workers
4. **Simplified Configuration**: No strategy confusion at worker level
5. **Clear Responsibility**: Dispatcher routes, workers process
6. **Better Monitoring**: Per-provider metrics and health checks

## Configuration Examples

### Gemini Worker (Cost Optimized)
```bash
USE_PROVIDER_QUEUES=true
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=gemini
GEMINI_API_KEY=AIzaSy...
# Leave other API keys empty
```
**Result**: Consumes gemini-analysis-queue only ($1.087/1M analyses)

### OpenAI Worker (Balanced)
```bash
USE_PROVIDER_QUEUES=true
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=openai
OPENAI_API_KEY=sk-proj-...
# Leave other API keys empty
```
**Result**: Consumes openai-analysis-queue only ($5.125/1M analyses)

### Anthropic Worker (Premium Quality)
```bash
USE_PROVIDER_QUEUES=true
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# Leave other API keys empty
```
**Result**: Consumes anthropic-analysis-queue only ($48/1M analyses)

### Dispatcher (All Strategies)
```bash
# Dispatcher can use ANY strategy
PROVIDER_SELECTION_STRATEGY=ROUND_ROBIN
# or COST_OPTIMIZED, QUALITY_FIRST, WEIGHTED, MESSAGE_BASED, FIXED

AVAILABLE_PROVIDERS=openai,gemini,anthropic
```
**Result**: Routes to appropriate provider queues based on strategy

## Deployment Strategy

### Recommended Production Setup

```bash
# 1x Dispatcher (COST_OPTIMIZED strategy)
Service: dispatcher-prod
Strategy: COST_OPTIMIZED
Result: Routes to cheapest provider first

# 3x Gemini Workers (High volume, lowest cost)
Service: worker-gemini-prod
Replicas: 3
Queue: gemini-analysis-queue
Cost: $1.087/1M

# 2x OpenAI Workers (Balanced cost/quality)
Service: worker-openai-prod
Replicas: 2
Queue: openai-analysis-queue
Cost: $5.125/1M

# 1x Anthropic Worker (Premium quality)
Service: worker-anthropic-prod
Replicas: 1
Queue: anthropic-analysis-queue
Cost: $48/1M
```

### Load-Based Scaling

Monitor queue depths and scale independently:

```bash
# High Gemini queue depth → Scale up Gemini workers
railway service scale worker-gemini-prod --replicas 5

# Low Anthropic usage → Scale down Anthropic workers
railway service scale worker-anthropic-prod --replicas 0

# Balanced load → Adjust dispatcher strategy
PROVIDER_SELECTION_STRATEGY=WEIGHTED
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":70},{"provider":"openai","weight":25},{"provider":"anthropic","weight":5}]
```

## Error Handling

### Missing PROVIDER_FIXED
```bash
❌ Error: PROVIDER_FIXED must be set when PROVIDER_SELECTION_STRATEGY=FIXED.
Set PROVIDER_FIXED to one of: openai, gemini, anthropic
```

### Wrong Strategy
```bash
❌ Error: Worker strategy must be FIXED when USE_PROVIDER_QUEUES=true.
Current strategy: ROUND_ROBIN.
Set PROVIDER_SELECTION_STRATEGY=FIXED and PROVIDER_FIXED=<provider>
```

### Invalid Provider
```bash
❌ Error: Invalid PROVIDER_FIXED value: gpt4.
Must be one of: openai, gemini, anthropic
```

## Testing

### Build Verification
```bash
cd workers/analysis-worker
npm run build
✅ Build successful with no TypeScript errors
```

### Configuration Validation
1. Start worker with ROUND_ROBIN strategy → Should fail with clear error
2. Start worker with FIXED but no PROVIDER_FIXED → Should fail with clear error
3. Start worker with FIXED + PROVIDER_FIXED=gemini → Should start successfully and consume gemini-queue only

## Migration Path

### Phase 1: Current State (Completed)
- ✅ Code implementation with validation
- ✅ Documentation updates
- ✅ Build verification

### Phase 2: Deployment (Next)
- Update Railway environment variables for all workers
- Set PROVIDER_SELECTION_STRATEGY=FIXED
- Set PROVIDER_FIXED=<provider> for each worker instance
- Verify each worker consumes from single queue only

### Phase 3: Monitoring (Ongoing)
- Monitor queue depths per provider
- Track processing times per provider
- Adjust replica counts based on load
- Optimize dispatcher strategy based on metrics

## Files Changed

1. **workers/analysis-worker/src/index.ts**
   - Lines 242-304: Queue consumption logic with FIXED strategy enforcement

2. **workers/claudedocs/PlatformModernization/ENVIRONMENT_VARIABLES_REFERENCE.md**
   - Lines 141-220: Complete rewrite of provider strategy documentation

3. **workers/analysis-worker/.env.example**
   - Lines 45-182: Configuration template with FIXED-only examples

## Validation Checklist

- ✅ TypeScript compilation successful
- ✅ FIXED strategy validation implemented
- ✅ PROVIDER_FIXED validation implemented
- ✅ Queue mapping logic implemented
- ✅ Single queue consumption implemented
- ✅ Error messages clear and actionable
- ✅ Documentation updated
- ✅ Configuration template updated
- ✅ Deployment examples added

## Next Steps

1. **Deploy Updated Workers**: Update Railway environment variables
2. **Test in Staging**: Verify queue consumption behavior
3. **Monitor Performance**: Track per-provider metrics
4. **Optimize Scaling**: Adjust replica counts based on load
5. **Update Dispatcher**: Test different routing strategies

## References

- [Environment Variables Reference](./ENVIRONMENT_VARIABLES_REFERENCE.md)
- [Platform Modernization Progress](./PLATFORM_MODERNIZATION_PROGRESS.md)
- [Worker Configuration Template](../analysis-worker/.env.example)
