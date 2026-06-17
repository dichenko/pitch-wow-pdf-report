import fs from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import { Ajv2020, type AnySchema, type ErrorObject } from 'ajv/dist/2020.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AssistantsRegistry, Assistant } from '../../config/assistants.js';
import type { TemplateRegistry } from '../../config/templates.js';
import type { JobsRepo, Job } from '../../db/repositories/jobs.repo.js';
import { authenticateAssistant } from '../middleware/auth.js';
import { AppError } from '../../utils/errors.js';
import { addDaysIso, isPast, nowIso } from '../../utils/time.js';
import { generatePublicToken } from '../../utils/crypto.js';
import { jobDir } from '../../storage/paths.js';
import { ensureDir, writeJson } from '../../storage/storage.js';
import { env } from '../../config/env.js';

type ReportBody = {
  external_id?: string;
  template_id?: string;
  template_version?: string;
  payload?: unknown;
};

export type ReportsRoutesDeps = {
  assistants: AssistantsRegistry;
  templates: TemplateRegistry;
  jobs: JobsRepo;
};

export async function reportsRoutes(app: FastifyInstance, deps: ReportsRoutesDeps): Promise<void> {
  const ajv = new Ajv2020({ allErrors: true });
  const validators = new Map<string, ReturnType<typeof ajv.compile>>();

  function requireAssistant(request: FastifyRequest): Assistant {
    return authenticateAssistant(request, deps.assistants);
  }

  function assertOwned(job: Job | undefined, assistant: Assistant): Job {
    if (!job) throw new AppError('JOB_NOT_FOUND', 'Job not found', 404);
    if (job.assistant_id !== assistant.assistant_id) {
      throw new AppError('FORBIDDEN', 'Job belongs to another assistant', 403);
    }
    return job;
  }

  app.post('/v1/reports', async (request, reply) => {
    const assistant = requireAssistant(request);
    const body = (request.body ?? {}) as ReportBody;
    const requestedTemplateId = body.template_id ?? assistant.default_template_id;
    const requestedVersion = body.template_version ?? assistant.default_template_version;
    if (requestedTemplateId !== assistant.default_template_id || requestedVersion !== assistant.default_template_version) {
      throw new AppError('TEMPLATE_NOT_ALLOWED', 'Assistant is not allowed to use requested template', 403);
    }
    const template = deps.templates.get(requestedTemplateId, requestedVersion);
    if (!template) throw new AppError('TEMPLATE_NOT_FOUND', 'Template not found', 404);

    const payload = Object.prototype.hasOwnProperty.call(body, 'payload') ? body.payload : body;
    const payloadBytes = Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8');
    if (payloadBytes > env.MAX_PAYLOAD_BYTES) {
      throw new AppError('PAYLOAD_TOO_LARGE', 'Payload is too large', 413);
    }

    const validatorKey = `${template.id}@${template.version}`;
    const validate = validators.get(validatorKey) ?? ajv.compile(template.schema as AnySchema);
    validators.set(validatorKey, validate);
    if (!validate(payload)) {
      throw new AppError('VALIDATION_ERROR', 'Payload does not match template schema', 400, validate.errors?.map((error: ErrorObject) => ({
        path: error.instancePath || '/',
        message: error.message
      })));
    }

    const createdAt = new Date();
    const createdAtIso = createdAt.toISOString();
    const expiresAt = addDaysIso(createdAt, env.RETENTION_DAYS);
    const jobId = `job_${ulid()}`;
    const publicToken = generatePublicToken();
    const publicUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/r/${publicToken}.pdf`;
    const dir = jobDir(env.DATA_DIR, assistant.assistant_id, jobId, createdAt);
    ensureDir(dir);
    const inputPath = path.join(dir, 'input.json');
    writeJson(inputPath, payload);

    deps.jobs.create({
      id: jobId,
      external_id: body.external_id ?? null,
      assistant_id: assistant.assistant_id,
      template_id: template.id,
      template_version: template.version,
      status: 'queued',
      public_token: publicToken,
      public_url: publicUrl,
      input_json_path: inputPath,
      created_at: createdAtIso,
      updated_at: createdAtIso,
      expires_at: expiresAt
    });

    return reply.code(202).send({
      job_id: jobId,
      status: 'queued',
      status_url: `/v1/reports/${jobId}`,
      poll_after_seconds: 10
    });
  });

  app.get('/v1/reports/:job_id', async (request) => {
    const assistant = requireAssistant(request);
    const job = assertOwned(deps.jobs.getById((request.params as { job_id: string }).job_id), assistant);
    return statusResponse(job);
  });

  app.get('/v1/reports/:job_id/html', async (request, reply) => {
    const assistant = requireAssistant(request);
    const job = assertOwned(deps.jobs.getById((request.params as { job_id: string }).job_id), assistant);
    if (!job.rendered_html_path || !fs.existsSync(job.rendered_html_path)) {
      throw new AppError('JOB_NOT_FOUND', 'Rendered HTML not found', 404);
    }
    return reply.type('text/html; charset=utf-8').send(fs.createReadStream(job.rendered_html_path));
  });

  app.get('/v1/reports/:job_id/pdf', async (request, reply) => {
    const assistant = requireAssistant(request);
    const job = assertOwned(deps.jobs.getById((request.params as { job_id: string }).job_id), assistant);
    return sendPdf(job, reply);
  });

  app.get('/r/:public_token.pdf', async (request, reply) => {
    const token = (request.params as { public_token: string }).public_token;
    const job = deps.jobs.getByPublicToken(token);
    if (!job || job.status !== 'done' || isPast(job.expires_at)) {
      return reply.code(404).send({ error: 'JOB_NOT_FOUND', message: 'PDF not found' });
    }
    return sendPdf(job, reply);
  });
}

function statusResponse(job: Job): Record<string, unknown> {
  const base = {
    job_id: job.id,
    status: isPast(job.expires_at) && job.status === 'done' ? 'expired' : job.status,
    created_at: job.created_at,
    updated_at: job.updated_at
  };
  if (job.status === 'done') {
    return { ...base, pdf_url: job.public_url, expires_at: job.expires_at };
  }
  if (job.status === 'failed') {
    return {
      ...base,
      error: {
        code: job.error_code ?? 'RENDER_FAILED',
        message: job.error_message ?? 'PDF rendering failed'
      }
    };
  }
  return { ...base, poll_after_seconds: 10 };
}

function sendPdf(job: Job, reply: FastifyReply): FastifyReply {
  if (!job.pdf_path || !fs.existsSync(job.pdf_path) || isPast(job.expires_at)) {
    throw new AppError('JOB_NOT_FOUND', 'PDF not found', 404);
  }
  return reply
    .type('application/pdf')
    .header('Content-Disposition', 'inline; filename="report.pdf"')
    .send(fs.createReadStream(job.pdf_path));
}
