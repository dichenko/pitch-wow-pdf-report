import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { AssistantsRegistry } from './config/assistants.js';
import { TemplateRegistry } from './config/templates.js';
import { openDb } from './db/db.js';
import { JobsRepo } from './db/repositories/jobs.repo.js';
import { healthRoutes } from './api/routes/health.routes.js';
import { reportsRoutes } from './api/routes/reports.routes.js';
import { adminRoutes } from './api/routes/admin.routes.js';
import { AppError } from './utils/errors.js';
import { logger } from './utils/logger.js';

const appErrorCodes = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'PAYLOAD_TOO_LARGE',
  'TEMPLATE_NOT_FOUND',
  'TEMPLATE_NOT_ALLOWED',
  'RENDER_FAILED',
  'JOB_NOT_FOUND',
  'JOB_EXPIRED',
  'INTERNAL_ERROR'
]);

export type BuildAppOptions = {
  assistants?: AssistantsRegistry;
  templates?: TemplateRegistry;
  jobs?: JobsRepo;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: env.MAX_PAYLOAD_BYTES + 4096,
    genReqId: () => randomUUID()
  });

  const templates = options.templates ?? new TemplateRegistry(env.TEMPLATES_DIR);
  if (!options.templates) templates.load();
  const assistants = options.assistants ?? new AssistantsRegistry(env.ASSISTANTS_CONFIG_PATH);
  const jobs = options.jobs ?? new JobsRepo(openDb());

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const possibleCode = (error as Error & { code?: string }).code;
    if (error instanceof AppError || (possibleCode && appErrorCodes.has(possibleCode))) {
      return reply.code(error.statusCode ?? 500).send({
        error: possibleCode,
        message: error.message,
        ...('details' in error && error.details ? { details: error.details } : {})
      });
    }
    if (error.statusCode === 413) {
      return reply.code(413).send({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload is too large' });
    }
    if (error.statusCode === 400) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: error.message });
    }
    app.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  await app.register(healthRoutes);
  await app.register(reportsRoutes, { assistants, templates, jobs });
  await app.register(adminRoutes);

  return { app, assistants, templates, jobs };
}
