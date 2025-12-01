# Provider Metadata Configuration

**Purpose**: Dynamic configuration of AI provider costs and quality scores without code changes

**Implementation**: Phase 1, Day 2 - Multi-Provider Architecture

---

## Overview

The analysis worker uses **default metadata values** for provider cost and quality rankings, but these can be **completely overridden** through the `PROVIDER_METADATA` environment variable. This ensures flexibility as provider pricing changes or as you conduct A/B testing to measure actual quality performance.

---

## Default Values (November 2024)

These values are configured in [provider-selector.service.ts:60-82](../../../analysis-worker/src/services/provider-selector.service.ts#L60-L82):

```typescript
private providerMetadata: Map<ProviderName, ProviderMetadata> = new Map([
  ['gemini', {
    name: 'gemini',
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.30,
    costPerMillion: 1.087,  // Estimated average for typical analysis
    qualityScore: 7,        // Good quality
  }],
  ['openai', {
    name: 'openai',
    inputCostPerMillion: 0.250,
    outputCostPerMillion: 2.00,
    costPerMillion: 5.125,  // Estimated average
    qualityScore: 8,        // Very good quality
  }],
  ['anthropic', {
    name: 'anthropic',
    inputCostPerMillion: 3.00,
    outputCostPerMillion: 15.00,
    costPerMillion: 48.0,   // Estimated average
    qualityScore: 10,       // Excellent quality
  }],
]);
```

**Important Notes**:
1. These are **defaults only** - not hardcoded limits
2. The system uses these values **until you override them**
3. Values sourced from official provider documentation (November 2024)
4. `costPerMillion` is estimated based on typical plant analysis token usage (~68K input, 2.5K output)

---

## How Metadata is Used

### COST_OPTIMIZED Strategy

```typescript
// From provider-selector.service.ts:165-183
private selectCostOptimized(): ProviderName {
  // Sort available providers by cost (cheapest first)
  const sortedByCost = this.config.availableProviders
    .map(provider => ({
      provider,
      cost: this.providerMetadata.get(provider)?.costPerMillion || Infinity,
    }))
    .sort((a, b) => a.cost - b.cost);

  const selected = sortedByCost[0].provider;

  this.logger.debug({
    provider: selected,
    cost: this.providerMetadata.get(selected)?.costPerMillion,
    ranking: sortedByCost.map(p => `${p.provider}:$${p.cost.toFixed(2)}`),
  }, 'Cost-optimized provider selected');

  return selected;
}
```

**Default Behavior** (with default metadata):
- Selects Gemini (cost: $1.087)
- Logs: `Cost-optimized provider selected: provider="gemini" cost=1.087 ranking=["gemini:$1.09","openai:$5.13","anthropic:$48.00"]`

**After Override** (example with updated pricing):
```bash
PROVIDER_METADATA={"gemini":{"costPerMillion":2.0},"openai":{"costPerMillion":1.5}}
```
- Selects OpenAI (new cost: $1.5, cheaper than updated Gemini $2.0)
- Logs: `Cost-optimized provider selected: provider="openai" cost=1.5 ranking=["openai:$1.50","gemini:$2.00","anthropic:$48.00"]`

### QUALITY_FIRST Strategy

```typescript
// From provider-selector.service.ts:189-207
private selectQualityFirst(): ProviderName {
  // Sort available providers by quality (best first)
  const sortedByQuality = this.config.availableProviders
    .map(provider => ({
      provider,
      quality: this.providerMetadata.get(provider)?.qualityScore || 0,
    }))
    .sort((a, b) => b.quality - a.quality); // Descending order

  const selected = sortedByQuality[0].provider;

  return selected;
}
```

**Default Behavior**:
- Selects Anthropic (quality: 10)
- Ranking: Anthropic (10) → OpenAI (8) → Gemini (7)

**After Override** (based on A/B testing results):
```bash
PROVIDER_METADATA={"gemini":{"qualityScore":9},"openai":{"qualityScore":7}}
```
- Selects Anthropic (quality: 10, unchanged)
- New ranking: Anthropic (10) → Gemini (9) → OpenAI (7)

---

## Environment Variable Configuration

### Format

```bash
PROVIDER_METADATA={"provider_name":{"key":"value"}}
```

**Supported Keys**:
- `costPerMillion` (number): Cost per 1 million tokens (input + output weighted average)
- `qualityScore` (number): Quality score 1-10 (10 = best)
- `inputCostPerMillion` (number): Cost per 1M input tokens
- `outputCostPerMillion` (number): Cost per 1M output tokens

**Partial Updates Supported**: You only need to specify values you want to override. Unspecified values retain defaults.

### Examples

#### Update Only Costs (Keep Default Quality Scores)

```bash
# Gemini pricing increased, OpenAI pricing decreased
PROVIDER_METADATA={"gemini":{"costPerMillion":1.5},"openai":{"costPerMillion":4.0}}
```

**Result**:
- Gemini: cost = $1.5, quality = 7 (default)
- OpenAI: cost = $4.0, quality = 8 (default)
- Anthropic: cost = $48.0 (default), quality = 10 (default)

#### Update Based on A/B Testing Results

```bash
# After 10K analyses, measured actual quality performance
PROVIDER_METADATA={"gemini":{"qualityScore":8.5},"openai":{"qualityScore":8.2},"anthropic":{"qualityScore":9.8}}
```

**Impact on QUALITY_FIRST Strategy**:
- Before: Anthropic (10) → OpenAI (8) → Gemini (7)
- After: Anthropic (9.8) → Gemini (8.5) → OpenAI (8.2)

#### Complete Override with Detailed Costs

```bash
# Full metadata override with separate input/output costs
PROVIDER_METADATA={
  "gemini": {
    "inputCostPerMillion": 0.10,
    "outputCostPerMillion": 0.40,
    "costPerMillion": 1.5,
    "qualityScore": 8
  },
  "openai": {
    "inputCostPerMillion": 0.30,
    "outputCostPerMillion": 2.50,
    "costPerMillion": 6.0,
    "qualityScore": 9
  }
}
```

---

## Loading Mechanism

The metadata loading happens in [index.ts:70-78](../../../analysis-worker/src/index.ts#L70-L78):

```typescript
// Load provider metadata from environment if configured
if (process.env.PROVIDER_METADATA) {
  try {
    const metadata = JSON.parse(process.env.PROVIDER_METADATA);
    this.providerSelector.loadProviderMetadataFromConfig(metadata);
    this.logger.info({ metadata }, 'Provider metadata loaded from environment');
  } catch (error: any) {
    this.logger.warn({ error: error.message }, 'Failed to parse PROVIDER_METADATA from environment');
  }
}
```

**Process**:
1. Worker starts
2. Reads `PROVIDER_METADATA` environment variable
3. Parses JSON
4. Calls `loadProviderMetadataFromConfig()` to update defaults
5. Logs confirmation with updated values

**Error Handling**:
- Invalid JSON: Logs warning, keeps defaults
- Unknown provider names: Logs warning, ignores invalid entries
- Missing keys: Uses default values for missing keys

---

## Runtime Updates

The system also supports **runtime updates** through the `updateProviderMetadata()` method (useful for future dashboard integrations):

```typescript
// From provider-selector.service.ts:315-334
updateProviderMetadata(provider: ProviderName, metadata: Partial<ProviderMetadata>): void {
  const current = this.providerMetadata.get(provider);
  if (!current) {
    this.logger.warn({ provider }, 'Attempted to update unknown provider metadata');
    return;
  }

  const updated = { ...current, ...metadata };
  this.providerMetadata.set(provider, updated);

  this.logger.info({
    provider,
    oldMetadata: current,
    newMetadata: updated,
  }, 'Provider metadata updated');
}
```

**Use Cases**:
- Admin dashboard for real-time cost adjustments
- Automated pricing updates from provider API monitoring
- A/B testing quality score updates based on user feedback

---

## Verification

### Check Loaded Metadata in Logs

**Startup Logs**:
```json
{
  "level": "info",
  "metadata": {
    "gemini": {"costPerMillion": 1.5, "qualityScore": 8},
    "openai": {"costPerMillion": 4.0, "qualityScore": 9}
  },
  "msg": "Provider metadata loaded from environment"
}
```

### Debug Provider Selection

**Enable Debug Logging**:
```bash
LOG_LEVEL=debug
```

**Cost-Optimized Selection Log**:
```json
{
  "level": "debug",
  "provider": "gemini",
  "cost": 1.5,
  "ranking": ["gemini:$1.50", "openai:$4.00", "anthropic:$48.00"],
  "msg": "Cost-optimized provider selected"
}
```

**Quality-First Selection Log**:
```json
{
  "level": "debug",
  "provider": "anthropic",
  "qualityScore": 9.8,
  "ranking": ["anthropic:9.8", "gemini:8.5", "openai:8.2"],
  "msg": "Quality-first provider selected"
}
```

---

## Best Practices

### 1. Document Your Overrides

Create a reference document with your production metadata:

```bash
# production-metadata.md
## Provider Metadata (Updated: 2025-01-15)

Based on:
- Gemini pricing: https://ai.google.dev/pricing (verified 2025-01-15)
- OpenAI pricing: https://openai.com/pricing (verified 2025-01-15)
- Anthropic pricing: https://anthropic.com/pricing (verified 2025-01-15)
- Quality scores: 10K analysis A/B test results (2024-12-20 to 2025-01-10)

PROVIDER_METADATA={
  "gemini": {"costPerMillion": 1.2, "qualityScore": 8.3},
  "openai": {"costPerMillion": 5.5, "qualityScore": 8.7},
  "anthropic": {"costPerMillion": 50.0, "qualityScore": 9.6}
}
```

### 2. Verify Against Official Pricing

**Gemini Pricing**: https://ai.google.dev/pricing
**OpenAI Pricing**: https://openai.com/pricing
**Anthropic Pricing**: https://anthropic.com/pricing

Set reminders to check pricing quarterly or when providers announce changes.

### 3. A/B Test Quality Scores

Don't rely on provider marketing claims. Measure actual quality:

1. Run 1,000 analyses with each provider
2. Calculate accuracy metrics (species identification, disease detection)
3. Update `qualityScore` based on measured performance
4. Re-test quarterly to detect model improvements/regressions

### 4. Monitor Cost Impact

After updating metadata, verify actual cost changes:

```bash
# Before update
railway logs | grep "Cost-optimized" | tail -100

# After PROVIDER_METADATA update
railway logs | grep "Cost-optimized" | tail -100

# Compare provider distribution
```

### 5. Gradual Rollout for Major Changes

When making significant metadata changes:

1. **Staging First**: Test in staging environment
2. **Single Worker**: Update one production worker's metadata
3. **Monitor**: Watch for 24 hours
4. **Compare**: Old vs new worker cost/quality metrics
5. **Full Rollout**: Update all workers if successful

---

## Common Scenarios

### Scenario 1: Provider Raises Prices

**Event**: OpenAI increases pricing by 20%

**Action**:
```bash
# Old: $5.125 → New: $6.15
PROVIDER_METADATA={"openai":{"costPerMillion":6.15}}
```

**Impact on COST_OPTIMIZED**:
- Before: Gemini ($1.087) → OpenAI ($5.125) → Anthropic ($48.0)
- After: Gemini ($1.087) → OpenAI ($6.15) → Anthropic ($48.0)
- No change in selection order, but cost calculations updated

### Scenario 2: New Model Outperforms Expectations

**Event**: Gemini 2.0 Flash proves higher quality than initially estimated

**Action** (after A/B testing):
```bash
# Measured quality: 8.5/10 (better than expected 7/10)
PROVIDER_METADATA={"gemini":{"qualityScore":8.5}}
```

**Impact on QUALITY_FIRST**:
- Before: Anthropic (10) → OpenAI (8) → Gemini (7)
- After: Anthropic (10) → Gemini (8.5) → OpenAI (8)
- Gemini now selected more often in quality-first scenarios

### Scenario 3: Temporary Provider Discount

**Event**: Anthropic offers 50% discount for limited time

**Action**:
```bash
# Temporary pricing: $48.0 → $24.0
PROVIDER_METADATA={"anthropic":{"costPerMillion":24.0}}
```

**Impact on COST_OPTIMIZED**:
- Before: Gemini ($1.087) → OpenAI ($5.125) → Anthropic ($48.0)
- After: Gemini ($1.087) → OpenAI ($5.125) → Anthropic ($24.0)
- Still uses Gemini first, but cheaper Anthropic fallback

**Cleanup** (after promotion ends):
```bash
# Remove override to restore default $48.0
PROVIDER_METADATA={}
```

---

## Related Files

- **Service Implementation**: [provider-selector.service.ts](../../../analysis-worker/src/services/provider-selector.service.ts)
- **Loading Logic**: [index.ts:70-78](../../../analysis-worker/src/index.ts#L70-L78)
- **Type Definitions**: [config.ts](../../../analysis-worker/src/types/config.ts)
- **Deployment Guide**: [RAILWAY_STAGING_DEPLOYMENT.md](./RAILWAY_STAGING_DEPLOYMENT.md)

---

## Summary

**Key Takeaways**:

1. ✅ **Not Hardcoded**: All cost and quality values are configurable via `PROVIDER_METADATA`
2. ✅ **Defaults Provided**: System works out-of-box with reasonable November 2024 pricing
3. ✅ **Partial Updates**: Override only specific values, keep others as defaults
4. ✅ **Strategy-Aware**: Both COST_OPTIMIZED and QUALITY_FIRST respect metadata
5. ✅ **Runtime Updates**: Future support for admin dashboard adjustments
6. ✅ **Transparent**: All decisions logged with costs/quality scores shown

**When to Update**:
- Provider announces pricing changes
- A/B testing reveals actual quality differences
- Seasonal promotions or enterprise discount negotiations
- Model upgrades that affect token usage patterns

**Last Updated**: 2025-12-01
**Default Metadata Source**: Official provider pricing (November 2024) + internal estimates
**Next Review**: Quarterly pricing verification recommended
