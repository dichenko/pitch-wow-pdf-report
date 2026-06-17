# Technical Specification: Pitch-wow-pdf-report

## 1. Project Overview

Build a private PDF report generation service called **Pitch-wow-pdf-report**.

The service receives authorized API requests from multiple internal AI assistants. Each assistant conducts an interview with a founder, produces a structured JSON payload, and sends it to this PDF service. The PDF service validates the JSON, renders a 3–5 page presentation using a local HTML/CSS template, generates a PDF through a headless browser, stores the generated PDF and debug HTML for 30 days, and returns a unique public PDF link.

The service will be deployed on a VPS using Docker Compose. The server already has a global Caddy reverse proxy managed outside this project. This project must expose an internal HTTP port only; the owner will configure the external Caddy domain manually.

Expected load: around **20 PDFs per day**.

VPS size: approximately **2 vCPU / 2 GB RAM**.

Because headless Chromium can consume significant memory, the renderer must use a queue and process jobs with **global concurrency = 1** by default.

---

## 2. Core Requirements

### 2.1 Main Flow

1. An AI assistant sends an authorized API request with a JSON payload.
2. The service identifies the assistant by API key.
3. The service determines which template is assigned to this assistant.
4. The service validates the payload against the JSON Schema of that template.
5. The service creates a render job.
6. The API immediately returns `job_id` and a status URL.
7. The assistant polls the status endpoint every 10 seconds.
8. When the job is complete, the status endpoint returns a unique public PDF URL.
9. The assistant sends this PDF link to the end user.
10. The generated PDF and rendered HTML are stored for 30 days.
11. Old files and job records are automatically cleaned up.

---

## 3. Recommended Stack

Use the following stack unless there is a strong reason to change it:

- **Node.js 20+**
- **TypeScript**
- **Fastify** for HTTP API
- **Playwright** for HTML → PDF rendering
- **Nunjucks** for HTML templates
- **AJV** for JSON Schema validation
- **SQLite** for lightweight job storage
- **Docker**
- **Docker Compose**
- **Pino** for structured logging

Do not use Redis or PostgreSQL in v1 unless needed later. For the expected load of 20 PDFs/day and global render concurrency = 1, SQLite is enough and simpler to operate on a small VPS.

SQLite must run in WAL mode.

---

## 4. Deployment Model

The service must run in Docker Compose.

Caddy is not part of this repository. The project should expose the app on localhost only, for example:

```yaml
ports:
  - "127.0.0.1:18080:8080"
```

The owner will configure the external Caddy reverse proxy manually.

The service must not require a public domain to start locally.

---

## 5. Repository Structure

Create the project with the following structure:

```text
pitch-wow-pdf-report/
  README.md
  WORKPLAN.md
  .env.example
  docker-compose.yml
  Dockerfile
  package.json
  tsconfig.json

  src/
    app.ts
    server.ts
    config/
      env.ts
      assistants.ts
      templates.ts

    api/
      routes/
        health.routes.ts
        reports.routes.ts
        admin.routes.ts
      middleware/
        auth.ts
        rateLimit.ts

    db/
      db.ts
      migrations/
        001_init.sql
      repositories/
        jobs.repo.ts
        assistants.repo.ts

    queue/
      jobQueue.ts
      worker.ts

    renderer/
      renderReport.ts
      buildHtml.ts
      pdf.ts
      templateEngine.ts
      assetPolicy.ts

    storage/
      paths.ts
      storage.ts
      cleanup.ts

    utils/
      crypto.ts
      errors.ts
      logger.ts
      time.ts

  config/
    assistants.example.json

  templates/
    united_ventures_dossier/
      v1/
        template.config.json
        schema.json
        template.html.njk
        styles.css
        sample.json
        prompt.md
        assets/
          logo.svg
          avatar.png
          font.woff2

    sample_founder_report/
      v1/
        template.config.json
        schema.json
        template.html.njk
        styles.css
        sample.json
        prompt.md
        assets/

  data/
    .gitkeep

  scripts/
    generate-api-key.ts
    render-sample.ts
    cleanup.ts
```

The `data/` directory must be mounted as a Docker volume and must contain:

```text
data/
  app.sqlite
  jobs/
    {assistant_id}/
      {yyyy-mm}/
        {job_id}/
          input.json
          rendered.html
          report.pdf
          metadata.json
          error.log
```

---

## 6. Assistant and Template Model

There will be around 10 internal assistants.

Each assistant has:

- unique `assistant_id`
- API key
- assigned default template
- optional rate limit
- active/inactive flag

The simplest v1 implementation should use a config file:

```text
config/assistants.json
```

Example:

```json
{
  "assistants": [
    {
      "assistant_id": "united_ventures_assistant",
      "name": "United Ventures Interview Assistant",
      "active": true,
      "api_key_hash": "sha256_or_bcrypt_hash_here",
      "default_template_id": "united_ventures_dossier",
      "default_template_version": "v1",
      "rate_limit_per_minute": 10
    },
    {
      "assistant_id": "sample_assistant",
      "name": "Sample Founder Interview Assistant",
      "active": true,
      "api_key_hash": "sha256_or_bcrypt_hash_here",
      "default_template_id": "sample_founder_report",
      "default_template_version": "v1",
      "rate_limit_per_minute": 10
    }
  ]
}
```

API keys must not be stored in plaintext.

Add a CLI script:

```bash
npm run generate-api-key
```

The script should output:

```text
Plain API key: pw_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Hash for config: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The plain key is shown only once.

---

## 7. Template Package

Each template version must be self-contained.

Example:

```text
templates/united_ventures_dossier/v1/
  template.config.json
  schema.json
  template.html.njk
  styles.css
  sample.json
  prompt.md
  assets/
```

### 7.1 `template.config.json`

Example:

```json
{
  "template_id": "united_ventures_dossier",
  "version": "v1",
  "name": "United Ventures Founder Dossier",
  "language": "ru",
  "page": {
    "width_px": 1024,
    "height_px": 768,
    "min_pages": 3,
    "max_pages": 5
  },
  "pdf": {
    "print_background": true,
    "prefer_css_page_size": true
  }
}
```

### 7.2 `schema.json`

Each template must have a JSON Schema.

The incoming payload must be validated against this schema before the render job is accepted.

If validation fails, the API must return HTTP `400` with a structured list of validation errors.

### 7.3 `template.html.njk`

The HTML template must use Nunjucks.

It must render all slides/pages from the payload.

Each page should be represented as a fixed-size `.slide` element.

Example:

```html
<section class="slide">
  ...
</section>
<section class="slide">
  ...
</section>
```

### 7.4 `styles.css`

CSS must define page size and print behavior:

```css
@page {
  size: 1024px 768px;
  margin: 0;
}

html,
body {
  margin: 0;
  padding: 0;
}

.slide {
  width: 1024px;
  height: 768px;
  page-break-after: always;
  overflow: hidden;
  position: relative;
}
```

### 7.5 `sample.json`

Each template must include a valid sample payload.

Add a script:

```bash
npm run render:sample -- united_ventures_dossier v1
```

This script should render the sample JSON into:

```text
data/sample-renders/united_ventures_dossier/v1/rendered.html
data/sample-renders/united_ventures_dossier/v1/report.pdf
```

---

## 8. Template Versioning Rules

Do not silently break existing templates.

Use this rule:

- Minor visual changes that do not change the JSON contract may stay in the same template version.
- Any change to the expected JSON shape must create a new version.

Example:

```text
templates/united_ventures_dossier/v1/
templates/united_ventures_dossier/v2/
```

Each assistant config points to a specific template version.

---

## 9. API Design

Base URL example:

```text
http://127.0.0.1:8080
```

External domain will be configured by the owner through Caddy.

All private API endpoints must use:

```http
Authorization: Bearer <api_key>
```

### 9.1 Health Check

```http
GET /health
```

Response:

```json
{
  "status": "ok",
  "service": "pitch-wow-pdf-report"
}
```

### 9.2 Create Report Job

```http
POST /v1/reports
Authorization: Bearer <api_key>
Content-Type: application/json
```

Request body:

```json
{
  "external_id": "optional-id-from-calling-assistant",
  "payload": {
    "schema_version": "1.0",
    "startup": {
      "name": "MaktabAI"
    }
  }
}
```

The client does not need to pass `template_id` in v1. The template is determined by the API key.

Optional future support:

```json
{
  "template_id": "united_ventures_dossier",
  "template_version": "v1",
  "payload": {}
}
```

But even if this is implemented, the service must verify that the authenticated assistant is allowed to use that template.

Successful response:

```http
202 Accepted
```

```json
{
  "job_id": "job_01JXXXXX",
  "status": "queued",
  "status_url": "/v1/reports/job_01JXXXXX",
  "poll_after_seconds": 10
}
```

Validation error response:

```http
400 Bad Request
```

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Payload does not match template schema",
  "details": [
    {
      "path": "/startup/name",
      "message": "must be string"
    }
  ]
}
```

Unauthorized response:

```http
401 Unauthorized
```

```json
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or missing API key"
}
```

### 9.3 Get Report Status

```http
GET /v1/reports/:job_id
Authorization: Bearer <api_key>
```

Queued response:

```json
{
  "job_id": "job_01JXXXXX",
  "status": "queued",
  "created_at": "2026-06-17T10:00:00.000Z",
  "updated_at": "2026-06-17T10:00:00.000Z",
  "poll_after_seconds": 10
}
```

Processing response:

```json
{
  "job_id": "job_01JXXXXX",
  "status": "processing",
  "created_at": "2026-06-17T10:00:00.000Z",
  "updated_at": "2026-06-17T10:00:08.000Z",
  "poll_after_seconds": 10
}
```

Done response:

```json
{
  "job_id": "job_01JXXXXX",
  "status": "done",
  "created_at": "2026-06-17T10:00:00.000Z",
  "updated_at": "2026-06-17T10:00:25.000Z",
  "pdf_url": "https://example.com/r/very-long-random-token.pdf",
  "expires_at": "2026-07-17T10:00:25.000Z"
}
```

Failed response:

```json
{
  "job_id": "job_01JXXXXX",
  "status": "failed",
  "created_at": "2026-06-17T10:00:00.000Z",
  "updated_at": "2026-06-17T10:00:25.000Z",
  "error": {
    "code": "RENDER_FAILED",
    "message": "PDF rendering failed"
  }
}
```

Important: one assistant must not be able to access jobs created by another assistant.

### 9.4 Public PDF Link

```http
GET /r/:public_token.pdf
```

This endpoint does not require API authorization.

Requirements:

- Token must be long, random, and unguessable.
- Token must expire after 30 days.
- If expired or missing, return `404`.
- Do not expose local file paths.
- Send correct headers:
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="report.pdf"`

Example public link:

```text
https://pdf-api.example.com/r/pw_7f2b8d0d8dbb4ef7b03d0c765e4f9c42.pdf
```

### 9.5 Authenticated Debug HTML Endpoint

```http
GET /v1/reports/:job_id/html
Authorization: Bearer <api_key>
```

Returns the rendered HTML for debugging.

This endpoint must be private and must only work for the assistant that owns the job, or for an admin key.

### 9.6 Authenticated PDF Endpoint

```http
GET /v1/reports/:job_id/pdf
Authorization: Bearer <api_key>
```

Returns the PDF file directly.

This is useful for debugging and internal use.

---

## 10. Job Lifecycle

Possible statuses:

```text
queued
processing
done
failed
expired
```

### 10.1 Job Creation

When a job is created:

1. Generate `job_id`.
2. Generate `public_token`.
3. Save assistant ID, template ID, template version, payload, status.
4. Save `input.json` to disk.
5. Add job to the queue.

### 10.2 Job Processing

The worker must:

1. Take the next queued job.
2. Mark it as `processing`.
3. Load template package.
4. Render Nunjucks HTML with the payload.
5. Save `rendered.html`.
6. Open the HTML in Playwright.
7. Generate PDF.
8. Save `report.pdf`.
9. Mark the job as `done`.
10. Save public PDF URL and expiration time.

### 10.3 Job Failure

If rendering fails:

1. Mark job as `failed`.
2. Save error details to DB.
3. Save `error.log`.
4. Return failed status through status endpoint.
5. Do not expose internal stack traces through the public API.

---

## 11. Queue Requirements

Use a simple persistent queue backed by SQLite.

The API and worker can run in the same Node.js process for v1, but the code should be structured so the worker can later become a separate process.

Queue rules:

- Global concurrency: `1`
- Job timeout: `60 seconds`
- Max retries: `1`
- Retry delay: `10 seconds`
- Max payload size: configurable, default `256 KB`
- Max pages per report: from `template.config.json`, default `5`

The worker must not start more than one Playwright render at the same time.

This is important because the VPS has limited RAM.

---

## 12. Rendering Requirements

Use Playwright Chromium.

PDF rendering must use:

```ts
await page.pdf({
  path: outputPdfPath,
  printBackground: true,
  preferCSSPageSize: true
});
```

The renderer must use local assets only.

External HTTP/HTTPS requests from rendered pages must be blocked.

Rules:

- All fonts must be local.
- All logos must be local.
- All images must be local.
- No user-uploaded images in v1.
- No external image URLs in JSON.
- No external CSS or JS.
- No CDN resources.

If the template tries to load an external URL, abort the request and fail the job with a clear error.

---

## 13. Storage and Retention

Generated files must be stored in:

```text
data/jobs/{assistant_id}/{yyyy-mm}/{job_id}/
```

Each job directory must contain:

```text
input.json
rendered.html
report.pdf
metadata.json
error.log
```

`error.log` is only required for failed jobs.

Retention period: **30 days**.

Add automatic cleanup:

- Runs once per day.
- Deletes expired job files.
- Marks old jobs as `expired` or deletes them from DB, depending on implementation.
- Public PDF links must stop working after expiration.

Default expiration:

```text
created_at + 30 days
```

Make this configurable through env:

```env
RETENTION_DAYS=30
```

---

## 14. Database Schema

Use SQLite.

Create migration:

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  assistant_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version TEXT NOT NULL,
  status TEXT NOT NULL,
  public_token TEXT NOT NULL UNIQUE,
  public_url TEXT,
  input_json_path TEXT NOT NULL,
  rendered_html_path TEXT,
  pdf_path TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_jobs_assistant_id ON jobs (assistant_id);
CREATE INDEX idx_jobs_status ON jobs (status);
CREATE INDEX idx_jobs_public_token ON jobs (public_token);
CREATE INDEX idx_jobs_expires_at ON jobs (expires_at);
```

Optional table for assistant config cache:

```sql
CREATE TABLE assistants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL,
  default_template_id TEXT NOT NULL,
  default_template_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

It is acceptable to keep assistants only in `config/assistants.json` for v1.

---

## 15. Environment Variables

Create `.env.example`:

```env
NODE_ENV=production
PORT=8080

PUBLIC_BASE_URL=https://pdf-api.example.com

DATA_DIR=/app/data
TEMPLATES_DIR=/app/templates
ASSISTANTS_CONFIG_PATH=/app/config/assistants.json

RETENTION_DAYS=30
MAX_PAYLOAD_BYTES=262144
WORKER_CONCURRENCY=1
JOB_TIMEOUT_SECONDS=60

LOG_LEVEL=info
```

`PUBLIC_BASE_URL` is used to generate public PDF URLs.

---

## 16. Security Requirements

### 16.1 API Keys

- Use `Authorization: Bearer <api_key>`.
- Do not store API keys in plaintext.
- Compare hashes safely.
- Do not log API keys.
- Do not return API keys through any endpoint.

### 16.2 Job Isolation

- Each API key belongs to one assistant.
- An assistant can only access its own jobs.
- A public PDF URL is accessible only through a long random token.

### 16.3 Input Limits

- Reject payloads larger than `MAX_PAYLOAD_BYTES`.
- Reject invalid JSON.
- Reject JSON that does not match the template schema.
- Reject unknown template access.

### 16.4 Asset Policy

- Block external network requests during rendering.
- Use only local assets.
- Do not execute arbitrary user-provided HTML.
- The JSON payload must be treated as data, not as executable HTML.

### 16.5 Public Links

- Public PDF tokens must be unguessable.
- Public links expire after 30 days.
- Expired public links return `404`.

---

## 17. Admin UI Decision

Do not build a full admin panel in v1.

Reason: templates will be edited by the designer in Git, not by non-technical users through a browser.

Instead, implement these developer-friendly tools:

1. `npm run generate-api-key`
2. `npm run render:sample -- <template_id> <version>`
3. `GET /health`
4. Authenticated debug HTML endpoint
5. Clear logs and job status API

Optional future admin panel:

- assistant list
- API key rotation
- job list
- failed job inspection
- sample preview
- template version assignment

Do not implement this optional admin panel in v1 unless explicitly requested later.

---

## 18. Docker Requirements

### 18.1 Dockerfile

The Docker image must include:

- Node.js
- Playwright dependencies
- Chromium required by Playwright
- production build

Use the official Playwright base image if it simplifies browser dependencies.

Example base image:

```Dockerfile
FROM mcr.microsoft.com/playwright:v1.XX.X-jammy
```

The exact version can be selected by the developer.

### 18.2 Docker Compose

Create `docker-compose.yml`:

```yaml
services:
  pitch-wow-pdf-report:
    build: .
    container_name: pitch-wow-pdf-report
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "127.0.0.1:18080:8080"
    volumes:
      - ./data:/app/data
      - ./config:/app/config:ro
      - ./templates:/app/templates:ro
    shm_size: "512mb"
```

Important:

- Use `shm_size: "512mb"` because Chromium may need shared memory.
- Do not expose the service publicly from Docker Compose.
- Caddy will be configured outside this project.

---

## 19. Logging

Use structured logs.

Each log line should include:

- timestamp
- level
- request_id
- assistant_id when available
- job_id when available
- message
- duration_ms for render jobs

Do not log:

- raw API keys
- full sensitive payloads in production logs

It is acceptable to store `input.json` inside the job directory because this is required for debugging. Retention cleanup must delete it after 30 days.

---

## 20. Error Codes

Use stable error codes:

```text
UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
PAYLOAD_TOO_LARGE
TEMPLATE_NOT_FOUND
TEMPLATE_NOT_ALLOWED
RENDER_FAILED
JOB_NOT_FOUND
JOB_EXPIRED
INTERNAL_ERROR
```

---

## 21. Testing Requirements

Add automated tests for:

- health endpoint
- missing API key
- invalid API key
- valid API key
- payload validation error
- successful job creation
- job ownership isolation
- public PDF token lookup
- expired token returns 404
- sample template render

Add at least one integration test that renders a sample PDF.

---

## 22. README Requirements

The README must explain:

1. What the service does.
2. How to install locally.
3. How to generate an API key.
4. How to add an assistant.
5. How to add a new template.
6. How to render a sample PDF.
7. How to run Docker Compose.
8. How to configure external Caddy.
9. How to call the API.
10. How to check job status.
11. How PDF retention works.

Include curl examples.

Example:

```bash
curl -X POST http://127.0.0.1:18080/v1/reports \
  -H "Authorization: Bearer pw_live_xxx" \
  -H "Content-Type: application/json" \
  -d @templates/united_ventures_dossier/v1/sample.json
```

---

# Implementation Workplan

The developer must create and maintain `WORKPLAN.md`.

Every stage below must be copied into `WORKPLAN.md` with checkboxes.

When a stage is completed, mark the checkbox as done.

## Stage 1 — Project Skeleton

- [ ] Initialize Node.js + TypeScript project.
- [ ] Add Fastify.
- [ ] Add Pino logger.
- [ ] Add environment config loader.
- [ ] Add `.env.example`.
- [ ] Add basic `/health` endpoint.
- [ ] Add Dockerfile.
- [ ] Add docker-compose.yml.
- [ ] Verify the service starts locally.
- [ ] Verify the service starts through Docker Compose.

## Stage 2 — Assistant Authentication

- [ ] Create `config/assistants.example.json`.
- [ ] Implement assistant config loader.
- [ ] Implement API key generation script.
- [ ] Implement API key hash verification.
- [ ] Implement `Authorization: Bearer` middleware.
- [ ] Add tests for missing API key.
- [ ] Add tests for invalid API key.
- [ ] Add tests for valid API key.
- [ ] Ensure API keys are never logged.

## Stage 3 — Template Registry

- [ ] Implement template discovery from `templates/`.
- [ ] Define `template.config.json` format.
- [ ] Load template metadata.
- [ ] Load template JSON Schema.
- [ ] Load template HTML and CSS.
- [ ] Add sample template package.
- [ ] Add validation for missing template files.
- [ ] Add clear startup logs showing loaded templates.

## Stage 4 — Payload Validation

- [ ] Add AJV.
- [ ] Validate payload against the assigned template schema.
- [ ] Return structured `VALIDATION_ERROR` response.
- [ ] Enforce max payload size.
- [ ] Add tests for valid sample payload.
- [ ] Add tests for invalid payload.
- [ ] Add tests for payload too large.

## Stage 5 — SQLite Job Storage

- [ ] Add SQLite dependency.
- [ ] Create DB initialization logic.
- [ ] Enable WAL mode.
- [ ] Add migration `001_init.sql`.
- [ ] Implement jobs repository.
- [ ] Add job creation.
- [ ] Add job status updates.
- [ ] Add job lookup by ID.
- [ ] Add public token lookup.
- [ ] Add tests for job repository.

## Stage 6 — Report API

- [ ] Implement `POST /v1/reports`.
- [ ] Implement `GET /v1/reports/:job_id`.
- [ ] Implement job ownership checks.
- [ ] Implement public URL generation from `PUBLIC_BASE_URL`.
- [ ] Return `poll_after_seconds: 10`.
- [ ] Add tests for job creation.
- [ ] Add tests for status polling.
- [ ] Add tests for ownership isolation.

## Stage 7 — HTML Rendering

- [ ] Add Nunjucks.
- [ ] Implement `buildHtml()`.
- [ ] Inject CSS into the final HTML or link it safely as a local asset.
- [ ] Render sample payload into HTML.
- [ ] Save `rendered.html` in job directory.
- [ ] Add `npm run render:sample -- <template_id> <version>`.
- [ ] Verify sample HTML opens correctly in a browser.
- [ ] Add tests for sample HTML rendering.

## Stage 8 — PDF Rendering with Playwright

- [ ] Add Playwright.
- [ ] Implement HTML → PDF rendering.
- [ ] Use `printBackground: true`.
- [ ] Use `preferCSSPageSize: true`.
- [ ] Set global worker concurrency to 1.
- [ ] Add render timeout.
- [ ] Save `report.pdf`.
- [ ] Test rendering inside Docker.
- [ ] Ensure Docker has sufficient `shm_size`.
- [ ] Add integration test for sample PDF generation.

## Stage 9 — Network and Asset Safety

- [ ] Ensure templates use only local assets.
- [ ] Block external HTTP/HTTPS requests during Playwright rendering.
- [ ] Fail the job if an external resource is requested.
- [ ] Add clear error message for blocked external assets.
- [ ] Add test template or test case for blocked external URL.
- [ ] Ensure user JSON cannot inject executable HTML.

## Stage 10 — Queue and Worker

- [ ] Implement persistent SQLite-backed queue.
- [ ] Implement worker loop.
- [ ] Worker picks queued jobs one by one.
- [ ] Worker marks jobs as `processing`.
- [ ] Worker marks jobs as `done`.
- [ ] Worker marks failed jobs as `failed`.
- [ ] Add max retry count.
- [ ] Add retry delay.
- [ ] Add render timeout handling.
- [ ] Add tests for failed job flow.

## Stage 11 — Public PDF Endpoint

- [ ] Implement `GET /r/:public_token.pdf`.
- [ ] Return PDF with correct headers.
- [ ] Return 404 for unknown token.
- [ ] Return 404 for expired token.
- [ ] Do not expose file paths.
- [ ] Add tests for public PDF access.
- [ ] Add tests for expired public link.

## Stage 12 — Debug Endpoints

- [ ] Implement `GET /v1/reports/:job_id/html`.
- [ ] Implement `GET /v1/reports/:job_id/pdf`.
- [ ] Protect both endpoints with API key auth.
- [ ] Enforce assistant ownership checks.
- [ ] Return 404 or 403 where appropriate.
- [ ] Add tests for debug HTML access.
- [ ] Add tests for debug PDF access.

## Stage 13 — Retention Cleanup

- [ ] Implement cleanup job.
- [ ] Delete files older than `RETENTION_DAYS`.
- [ ] Mark jobs as `expired` or remove old records.
- [ ] Ensure expired public PDF links stop working.
- [ ] Add manual cleanup script.
- [ ] Add tests for cleanup logic.

## Stage 14 — Documentation

- [ ] Write README.md.
- [ ] Add local development instructions.
- [ ] Add Docker Compose instructions.
- [ ] Add API key generation instructions.
- [ ] Add assistant configuration instructions.
- [ ] Add template creation instructions.
- [ ] Add curl examples.
- [ ] Add Caddy reverse proxy example.
- [ ] Add troubleshooting section.

## Stage 15 — Final Verification

- [ ] Start the service with Docker Compose.
- [ ] Generate an API key.
- [ ] Configure one assistant.
- [ ] Render sample report.
- [ ] Poll job status.
- [ ] Open generated public PDF URL.
- [ ] Open authenticated debug HTML endpoint.
- [ ] Confirm files are saved under `data/jobs/`.
- [ ] Confirm external network assets are blocked.
- [ ] Confirm old files can be cleaned up manually.
- [ ] Confirm memory usage is acceptable on 2 GB RAM VPS.

---

# Acceptance Criteria

The project is complete when:

- [ ] The service runs with Docker Compose.
- [ ] The service exposes only localhost port `18080`.
- [ ] `/health` returns ok.
- [ ] Authorized assistant can create a PDF job.
- [ ] Unauthorized requests are rejected.
- [ ] Invalid JSON payloads are rejected with clear validation errors.
- [ ] A valid payload creates a queued job.
- [ ] Worker renders HTML and PDF.
- [ ] The status endpoint returns a public PDF link when done.
- [ ] The public PDF link works without API authorization.
- [ ] Public PDF links expire after 30 days.
- [ ] Rendered HTML is stored next to PDF.
- [ ] Debug HTML is available only through authenticated endpoint.
- [ ] Templates are versioned.
- [ ] Each assistant can have its own template.
- [ ] External resources are blocked during rendering.
- [ ] Sample template can be rendered through CLI.
- [ ] README explains setup and usage.
- [ ] WORKPLAN.md checkboxes are updated as work progresses.
