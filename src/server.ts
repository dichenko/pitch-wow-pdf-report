import { env } from './config/env.js';
import { buildApp } from './app.js';
import { Worker } from './queue/worker.js';
import { scheduleCleanup } from './storage/cleanup.js';

const { app, templates, jobs } = await buildApp();
const worker = new Worker(jobs, templates);
worker.start();
scheduleCleanup(jobs);

await app.listen({ host: '0.0.0.0', port: env.PORT });
