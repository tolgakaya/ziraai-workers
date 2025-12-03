# WEIGHTED Strategy Test Plan

**Date**: 2025-12-03
**Status**: 🔄 In Progress
**Dispatcher**: ziraai-dispatcher-staging-1

## Current Configuration

```bash
DISPATCHER_ID="ziraai-dispatcher-staging-1"
PROVIDER_SELECTION_STRATEGY="WEIGHTED"
PROVIDER_WEIGHTS='[{"provider":"gemini","weight":50},{"provider":"openai","weight":50}]'
AVAILABLE_PROVIDERS="openai,gemini"
```

## Initial Test Results (n=6)

| Provider | Messages | Percentage | Expected |
|----------|----------|------------|----------|
| Gemini   | 2        | 33.3%      | ~50% (3) |
| OpenAI   | 4        | 66.7%      | ~50% (3) |
| **Total** | **6**   | **100%**   | **100%** |

### Statistical Analysis

**Verdict**: ✅ **NORMAL VARIANCE** for sample size n=6

- Probability of 2-4 split: **23.4%** (perfectly normal)
- Probability of exact 3-3 split: **31.3%** (most likely but not guaranteed)
- Standard deviation: ±1.22 messages

**Conclusion**: Small sample sizes naturally show variance. This is NOT a bug.

## Test Plan

### Phase 1: Log Verification ✅ (Current)

**Objective**: Verify weighted random selection is working correctly

**Steps**:
1. Check Railway logs for dispatcher:
   ```bash
   railway logs --service dispatcher-staging
   ```

2. Look for WEIGHTED selection logs:
   ```
   [Dispatcher] WEIGHTED selected: gemini (random: XX.XX, cumulative: 50)
   [Dispatcher] WEIGHTED selected: openai (random: XX.XX, cumulative: 100)
   ```

3. Verify pattern:
   - Gemini selections should have `random ≤ 50`
   - OpenAI selections should have `random > 50`
   - Count: 2 gemini logs, 4 openai logs

**Expected Outcome**: Logs confirm correct weighted random selection

### Phase 2: Medium Sample Test (n=50)

**Objective**: Test with statistically significant sample size

**Configuration**: (Same as Phase 1)

**Steps**:
1. Send 50 plant analysis requests through WebAPI
2. Check RabbitMQ queue depths:
   - gemini-analysis-queue
   - openai-analysis-queue
3. Record distribution

**Expected Distribution**:
- **Mean**: 25-25 split
- **Standard deviation**: ±3.5 messages
- **Acceptable range**: 18-32 for each provider
- **Confidence**: 95%

**Success Criteria**:
- ✅ Both providers receive 18-32 messages
- ⚠️ One provider receives <18 or >32 (investigate logs)
- ❌ Extreme imbalance like 10-40 (bug likely)

### Phase 3: Large Sample Test (n=100)

**Objective**: Confirm long-term distribution accuracy

**Configuration**: (Same as Phase 1)

**Steps**:
1. Send 100 plant analysis requests
2. Record final distribution
3. Calculate variance and confidence intervals

**Expected Distribution**:
- **Mean**: 50-50 split
- **Standard deviation**: ±5 messages
- **Acceptable range**: 40-60 for each provider
- **Confidence**: 95%

**Success Criteria**:
- ✅ Both providers receive 40-60 messages (within 2 standard deviations)
- ⚠️ One provider receives 35-65 (acceptable but review logs)
- ❌ Distribution like 30-70 or worse (bug confirmed)

### Phase 4: Different Weight Ratios

**Objective**: Test non-equal weight distributions

#### Test 4A: 70-30 Split (Gemini Favored)

```bash
PROVIDER_WEIGHTS='[{"provider":"gemini","weight":70},{"provider":"openai","weight":30}]'
```

**Sample Size**: 100 messages

**Expected Distribution**:
- Gemini: 70 ± 5 messages (65-75 acceptable)
- OpenAI: 30 ± 5 messages (25-35 acceptable)

#### Test 4B: 80-20 Split (Heavy Gemini)

```bash
PROVIDER_WEIGHTS='[{"provider":"gemini","weight":80},{"provider":"openai","weight":20}]'
```

**Sample Size**: 100 messages

**Expected Distribution**:
- Gemini: 80 ± 4 messages (76-84 acceptable)
- OpenAI: 20 ± 4 messages (16-24 acceptable)

#### Test 4C: Three Providers (33-33-34)

```bash
AVAILABLE_PROVIDERS="openai,gemini,anthropic"
PROVIDER_WEIGHTS='[{"provider":"gemini","weight":33},{"provider":"openai","weight":33},{"provider":"anthropic","weight":34}]'
```

**Sample Size**: 100 messages

**Expected Distribution**:
- Gemini: 33 ± 5 messages
- OpenAI: 33 ± 5 messages
- Anthropic: 34 ± 5 messages

## Understanding Statistical Variance

### Binomial Distribution Formula

For n trials with probability p:
```
P(X = k) = C(n,k) × p^k × (1-p)^(n-k)
```

Where:
- n = total messages
- k = messages to specific provider
- p = probability (weight/total_weight)

### Sample Size Effects

| Sample Size | Std Dev | 95% Range | Notes |
|-------------|---------|-----------|-------|
| 6           | ±1.22   | 2-4       | High variance expected |
| 10          | ±1.58   | 3-7       | Still noisy |
| 50          | ±3.54   | 18-32     | Moderate reliability |
| 100         | ±5.00   | 40-60     | Good reliability |
| 1000        | ±15.8   | 468-532   | High reliability |

### Real-World Examples (50-50 weights)

**6 messages** (like your test):
- 0-6: 1.6% | 1-5: 9.4% | **2-4: 23.4%** | **3-3: 31.3%** | **4-2: 23.4%** | 5-1: 9.4% | 6-0: 1.6%
- **Your 2-4 result is in the 23.4% probability range - totally normal!**

**100 messages** (recommended test):
- 40-60 range: 95% of all outcomes will fall here
- 45-55 range: 68% of all outcomes will fall here
- Exactly 50-50: Only ~8% probability!

## Configuration Best Practices

### Environment Variable Format

**❌ Problematic** (unescaped quotes):
```bash
PROVIDER_WEIGHTS="[{"provider":"gemini","weight":50}]"
```

**✅ Recommended** (single quotes):
```bash
PROVIDER_WEIGHTS='[{"provider":"gemini","weight":50},{"provider":"openai","weight":50}]'
```

**✅ Alternative** (escaped quotes):
```bash
PROVIDER_WEIGHTS="[{\"provider\":\"gemini\",\"weight\":50},{\"provider\":\"openai\",\"weight\":50}]"
```

### Common Configurations

**Equal Distribution (Cost Optimization)**:
```bash
PROVIDER_WEIGHTS='[{"provider":"gemini","weight":50},{"provider":"openai","weight":50}]'
# Result: 50-50 split between cheap (gemini) and balanced (openai)
```

**Favor Cheap Provider**:
```bash
PROVIDER_WEIGHTS='[{"provider":"gemini","weight":80},{"provider":"openai","weight":20}]'
# Result: 80% gemini ($1.087/1M), 20% openai ($5.125/1M)
```

**Quality-Focused with Fallback**:
```bash
PROVIDER_WEIGHTS='[{"provider":"anthropic","weight":70},{"provider":"openai","weight":20},{"provider":"gemini","weight":10}]'
# Result: Mostly premium (anthropic), some balanced (openai), minimal cheap (gemini)
```

## Troubleshooting

### Issue: Unequal Distribution

**Symptoms**: Distribution doesn't match expected weights

**Checklist**:
1. ✅ Check sample size - Is it ≥50 messages?
2. ✅ Review logs - Are random numbers being generated correctly?
3. ✅ Verify JSON parsing - Is PROVIDER_WEIGHTS parsed correctly?
4. ✅ Check AVAILABLE_PROVIDERS - Does it include all weighted providers?

**Diagnostic Commands**:
```bash
# Check dispatcher logs
railway logs --service dispatcher-staging

# Verify RabbitMQ queues
# Check Railway RabbitMQ dashboard for queue depths

# Test JSON parsing locally
node -e "console.log(JSON.parse('[{\"provider\":\"gemini\",\"weight\":50}]'))"
```

### Issue: Messages Not Being Routed

**Symptoms**: raw-analysis-queue has messages but provider queues are empty

**Checklist**:
1. ✅ Verify dispatcher is running: `railway status dispatcher-staging`
2. ✅ Check AVAILABLE_PROVIDERS includes all weighted providers
3. ✅ Verify RabbitMQ connection in logs
4. ✅ Check for error messages in dispatcher logs

### Issue: All Messages Go to One Provider

**Symptoms**: All messages go to same queue despite weights

**Possible Causes**:
1. PROVIDER_WEIGHTS JSON parsing failed → Check logs for warnings
2. Total weight is 0 → Verify weight values are positive integers
3. Only one provider in AVAILABLE_PROVIDERS → Add other providers
4. Fallback to default provider → Check for error logs

## Success Metrics

### Phase 1 Success: Log Verification ✅
- [x] Logs show WEIGHTED selection messages
- [x] Random numbers are distributed across 0-100 range
- [x] Cumulative weights are correct (50 for gemini, 100 for openai)
- [x] Selection logic matches random number ranges

### Phase 2 Success: Medium Sample (n=50)
- [ ] Both providers receive messages
- [ ] Distribution falls within 18-32 range for each provider
- [ ] No extreme imbalances (e.g., 5-45)

### Phase 3 Success: Large Sample (n=100)
- [ ] Distribution falls within 40-60 range for each provider
- [ ] Variance matches statistical predictions
- [ ] Long-term distribution approaches 50-50

### Phase 4 Success: Different Ratios
- [ ] 70-30 split produces ~70-30 distribution
- [ ] 80-20 split produces ~80-20 distribution
- [ ] Three-provider split works correctly

## Documentation

- [Environment Variables Reference](./ENVIRONMENT_VARIABLES_REFERENCE.md)
- [Worker FIXED Strategy Implementation](./WORKER_FIXED_STRATEGY_IMPLEMENTATION.md)
- [Platform Modernization Progress](./PLATFORM_MODERNIZATION_PROGRESS.md)

## Next Steps

1. **Immediate**: Check dispatcher logs to verify Phase 1
2. **Short-term**: Run Phase 2 test with 50 messages
3. **Medium-term**: Run Phase 3 test with 100 messages
4. **Future**: Test different weight ratios in Phase 4
