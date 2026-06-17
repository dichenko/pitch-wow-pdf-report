import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_BASE_URL: z.string().url().default('http://127.0.0.1:8080'),
  DATA_DIR: z.string().default(path.resolve('data')),
  TEMPLATES_DIR: z.string().default(path.resolve('templates')),
  ASSISTANTS_CONFIG_PATH: z.string().default(path.resolve('config/assistants.json')),
  RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  MAX_PAYLOAD_BYTES: z.coerce.number().int().positive().default(262144),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  JOB_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
  JOB_MAX_RETRIES: z.coerce.number().int().min(0).default(1),
  JOB_RETRY_DELAY_SECONDS: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z.string().default('info')
});

export const env = schema.parse(process.env);
