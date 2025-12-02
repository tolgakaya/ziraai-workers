# ZiraAI Dispatcher Service

Routes raw analysis requests from WebAPI to provider-specific worker queues based on configured strategy.

## Architecture

```
WebAPI → raw-analysis-queue
           ↓
       Dispatcher (this service)
           ↓
    [openai-queue, gemini-queue, anthropic-queue]
           ↓
       Worker Pool
```

## Features

- **FIXED Strategy**: Routes all requests to a single configured provider (Phase 1)
- **ROUND_ROBIN**: (Future) Distributes requests evenly across providers
- **COST_OPTIMIZED**: (Future) Routes based on provider pricing
- **LATENCY_OPTIMIZED**: (Future) Routes based on provider response times
- **Dead Letter Queue**: Failed routing attempts go to DLQ for investigation

## Configuration

See `.env.example` for all available environment variables.

### Key Settings

- `PROVIDER_SELECTION_STRATEGY`: Routing strategy (FIXED, ROUND_ROBIN, etc.)
- `PROVIDER_FIXED`: Provider to use when strategy is FIXED (openai, gemini, anthropic)
- `RABBITMQ_URL`: RabbitMQ connection string
- Queue names for raw input and provider-specific outputs

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start
```

## Docker Deployment

```bash
# Build image
docker build -t ziraai-dispatcher .

# Run container
docker run -d \
  -e DISPATCHER_ID=dispatcher-001 \
  -e PROVIDER_SELECTION_STRATEGY=FIXED \
  -e PROVIDER_FIXED=openai \
  -e RABBITMQ_URL=amqps://your-rabbitmq-url \
  ziraai-dispatcher
```

## Railway Deployment

1. Create new Railway service from this directory
2. Set environment variables in Railway dashboard
3. Deploy from GitHub or local push

## Phase 1 Implementation (Day 5)

Current implementation uses **FIXED strategy** only:
- All requests route to `openai-analysis-queue`
- Other strategies planned for Phase 2

## Message Flow

1. WebAPI publishes to `raw-analysis-queue`
2. Dispatcher consumes message
3. Dispatcher selects target queue based on strategy
4. Dispatcher publishes to provider queue (e.g., `openai-analysis-queue`)
5. Worker consumes from provider queue
6. Analysis results go to `plant-analysis-results`

## Monitoring

Logs include:
- Request received (with AnalysisId)
- Target queue selected
- Routing confirmation
- Error details (if routing fails)

## Error Handling

- Failed routing attempts go to `analysis-dlq`
- Original message preserved for debugging
- Graceful shutdown on SIGINT/SIGTERM
