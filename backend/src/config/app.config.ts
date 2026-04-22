import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  databaseUrl: process.env.DATABASE_URL!,
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  processing: {
    workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
    batchSize: Number(process.env.BATCH_SIZE ?? 5),
    inputDirectory: process.env.DOCUMENTS_INPUT_DIR ?? '/app/sample-data',
  },
}));
