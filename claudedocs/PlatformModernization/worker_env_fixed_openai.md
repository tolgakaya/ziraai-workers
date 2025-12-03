# Worker Environment Configuration - FIXED Strategy (OpenAI)
# Example configuration for Railway deployment

WORKER_ID="worker-staging-1"
NODE_ENV="staging"
RABBITMQ_URL="amqp://username:password@rabbitmq.railway.internal:5672"
REDIS_URL="redis://default:password@redis.railway.internal:6379"
RESULT_QUEUE="plant-analysis-results"
DLQ_QUEUE="analysis-dlq"
PREFETCH_COUNT="10"
OPENAI_API_KEY="sk-proj-YOUR_OPENAI_API_KEY_HERE"
PROVIDER_MODEL="gpt-4o-mini"
REDIS_KEY_PREFIX="ziraai:worker:ratelimit:"
PROVIDER_SELECTION_STRATEGY="FIXED"
PROVIDER_FIXED="openai"
USE_PROVIDER_QUEUES="true"
RATE_LIMIT="350"