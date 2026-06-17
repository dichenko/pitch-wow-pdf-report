import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-wow-test-'));
const dataDir = path.join(tempDir, 'data');
const assistantsPath = path.join(tempDir, 'assistants.json');
const sampleKey = 'pw_live_sample';
const otherKey = 'pw_live_other';

let app: Awaited<ReturnType<(typeof import('../src/app.js'))['buildApp']>>['app'];
let jobs: import('../src/db/repositories/jobs.repo.js').JobsRepo;
let db: import('../src/db/db.js').Db;
let sha256Hex: (value: string) => string;

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  process.env.TEMPLATES_DIR = path.join(root, 'templates');
  process.env.ASSISTANTS_CONFIG_PATH = assistantsPath;
  process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:8080';
  process.env.MAX_PAYLOAD_BYTES = '262144';
  process.env.LOG_LEVEL = 'silent';

  ({ sha256Hex } = await import('../src/utils/crypto.js'));
  fs.writeFileSync(assistantsPath, JSON.stringify({
    assistants: [
      {
        assistant_id: 'sample_assistant',
        name: 'Sample Assistant',
        active: true,
        api_key_hash: sha256Hex(sampleKey),
        default_template_id: 'sample_founder_report',
        default_template_version: 'v1',
        rate_limit_per_minute: 10
      },
      {
        assistant_id: 'other_assistant',
        name: 'Other Assistant',
        active: true,
        api_key_hash: sha256Hex(otherKey),
        default_template_id: 'united_ventures_dossier',
        default_template_version: 'v1',
        rate_limit_per_minute: 10
      }
    ]
  }, null, 2));

  const { buildApp } = await import('../src/app.js');
  const built = await buildApp();
  app = built.app;
  jobs = built.jobs;
  db = (jobs as unknown as { db: import('../src/db/db.js').Db }).db;
});

afterAll(async () => {
  await app.close();
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function auth(key = sampleKey) {
  return { authorization: `Bearer ${key}` };
}

function samplePayload() {
  return JSON.parse(fs.readFileSync(path.join(root, 'templates/sample_founder_report/v1/sample.json'), 'utf8'));
}

describe('app', () => {
  it('returns health status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'pitch-wow-pdf-report' });
  });

  it('rejects missing API key', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/reports', payload: samplePayload() });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('UNAUTHORIZED');
  });

  it('rejects invalid API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reports',
      headers: auth('wrong'),
      payload: samplePayload()
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns validation errors for invalid payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reports',
      headers: auth(),
      payload: { schema_version: '1.0', startup: { name: 123 } }
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details.length).toBeGreaterThan(0);
  });

  it('creates a job for valid payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reports',
      headers: auth(),
      payload: samplePayload()
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe('queued');
    expect(body.status_url).toBe(`/v1/reports/${body.job_id}`);

    const status = await app.inject({ method: 'GET', url: body.status_url, headers: auth() });
    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe('queued');
  });

  it('enforces job ownership isolation', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/reports',
      headers: auth(),
      payload: samplePayload()
    });
    const jobId = created.json().job_id;
    const res = await app.inject({ method: 'GET', url: `/v1/reports/${jobId}`, headers: auth(otherKey) });
    expect(res.statusCode).toBe(403);
  });

  it('serves public PDF token and rejects expired token', async () => {
    const createdAt = new Date();
    const jobId = 'job_public_test';
    const dir = path.join(dataDir, 'jobs', 'sample_assistant', '2026-06', jobId);
    fs.mkdirSync(dir, { recursive: true });
    const inputPath = path.join(dir, 'input.json');
    const pdfPath = path.join(dir, 'report.pdf');
    fs.writeFileSync(inputPath, '{}');
    fs.writeFileSync(pdfPath, '%PDF-1.4\n');
    jobs.create({
      id: jobId,
      external_id: null,
      assistant_id: 'sample_assistant',
      template_id: 'sample_founder_report',
      template_version: 'v1',
      status: 'queued',
      public_token: 'pw_public_test',
      public_url: 'http://127.0.0.1:8080/r/pw_public_test.pdf',
      input_json_path: inputPath,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString()
    });
    jobs.markDone(jobId, path.join(dir, 'rendered.html'), pdfPath, 'http://127.0.0.1:8080/r/pw_public_test.pdf', new Date().toISOString());

    const ok = await app.inject({ method: 'GET', url: '/r/pw_public_test.pdf' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toContain('application/pdf');

    const expiredId = 'job_expired_test';
    const expiredPdf = path.join(dir, 'expired.pdf');
    fs.writeFileSync(expiredPdf, '%PDF-1.4\n');
    jobs.create({
      id: expiredId,
      external_id: null,
      assistant_id: 'sample_assistant',
      template_id: 'sample_founder_report',
      template_version: 'v1',
      status: 'queued',
      public_token: 'pw_expired_test',
      public_url: 'http://127.0.0.1:8080/r/pw_expired_test.pdf',
      input_json_path: inputPath,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
      expires_at: new Date(Date.now() - 86400000).toISOString()
    });
    jobs.markDone(expiredId, path.join(dir, 'rendered.html'), expiredPdf, 'http://127.0.0.1:8080/r/pw_expired_test.pdf', new Date().toISOString());
    const expired = await app.inject({ method: 'GET', url: '/r/pw_expired_test.pdf' });
    expect(expired.statusCode).toBe(404);
  });

  it('renders sample payload into HTML', async () => {
    const { TemplateRegistry } = await import('../src/config/templates.js');
    const { buildHtml } = await import('../src/renderer/buildHtml.js');
    const templates = new TemplateRegistry(path.join(root, 'templates'));
    templates.load();
    const template = templates.get('sample_founder_report', 'v1');
    expect(template).toBeDefined();
    const html = buildHtml(template!, samplePayload());
    expect(html).toContain('MaktabAI');
    expect(html).toContain('<section class="slide cover">');
  });

  it('renders sample payload into PDF', async () => {
    const { TemplateRegistry } = await import('../src/config/templates.js');
    const { renderReport } = await import('../src/renderer/renderReport.js');
    const templates = new TemplateRegistry(path.join(root, 'templates'));
    templates.load();
    const template = templates.get('sample_founder_report', 'v1');
    const outputDir = path.join(tempDir, 'sample-pdf-render');
    fs.mkdirSync(outputDir, { recursive: true });
    const result = await renderReport(template!, samplePayload(), outputDir, 60000);
    expect(fs.existsSync(result.pdfPath)).toBe(true);
    expect(fs.statSync(result.pdfPath).size).toBeGreaterThan(1000);
  }, 90000);
});
