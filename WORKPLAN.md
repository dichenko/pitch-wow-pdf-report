# Implementation Workplan

## Stage 1 - Project Skeleton

- [x] Initialize Node.js + TypeScript project.
- [x] Add Fastify.
- [x] Add Pino logger.
- [x] Add environment config loader.
- [x] Add `.env.example`.
- [x] Add basic `/health` endpoint.
- [x] Add Dockerfile.
- [x] Add docker-compose.yml.
- [x] Verify the service starts locally.
- [ ] Verify the service starts through Docker Compose.

## Stage 2 - Assistant Authentication

- [x] Create `config/assistants.example.json`.
- [x] Implement assistant config loader.
- [x] Implement API key generation script.
- [x] Implement API key hash verification.
- [x] Implement `Authorization: Bearer` middleware.
- [x] Add tests for missing API key.
- [x] Add tests for invalid API key.
- [x] Add tests for valid API key.
- [x] Ensure API keys are never logged.

## Stage 3 - Template Registry

- [x] Implement template discovery from `templates/`.
- [x] Define `template.config.json` format.
- [x] Load template metadata.
- [x] Load template JSON Schema.
- [x] Load template HTML and CSS.
- [x] Add sample template package.
- [x] Add validation for missing template files.
- [x] Add clear startup logs showing loaded templates.

## Stage 4 - Payload Validation

- [x] Add AJV.
- [x] Validate payload against the assigned template schema.
- [x] Return structured `VALIDATION_ERROR` response.
- [x] Enforce max payload size.
- [x] Add tests for valid sample payload.
- [x] Add tests for invalid payload.
- [ ] Add tests for payload too large.

## Stage 5 - SQLite Job Storage

- [x] Add SQLite dependency.
- [x] Create DB initialization logic.
- [x] Enable WAL mode.
- [x] Add migration `001_init.sql`.
- [x] Implement jobs repository.
- [x] Add job creation.
- [x] Add job status updates.
- [x] Add job lookup by ID.
- [x] Add public token lookup.
- [ ] Add tests for job repository.

## Stage 6 - Report API

- [x] Implement `POST /v1/reports`.
- [x] Implement `GET /v1/reports/:job_id`.
- [x] Implement job ownership checks.
- [x] Implement public URL generation from `PUBLIC_BASE_URL`.
- [x] Return `poll_after_seconds: 10`.
- [x] Add tests for job creation.
- [x] Add tests for status polling.
- [x] Add tests for ownership isolation.

## Stage 7 - HTML Rendering

- [x] Add Nunjucks.
- [x] Implement `buildHtml()`.
- [x] Inject CSS into the final HTML or link it safely as a local asset.
- [x] Render sample payload into HTML.
- [x] Save `rendered.html` in job directory.
- [x] Add `npm run render:sample -- <template_id> <version>`.
- [x] Verify sample HTML opens correctly in a browser.
- [x] Add tests for sample HTML rendering.

## Stage 8 - PDF Rendering with Playwright

- [x] Add Playwright.
- [x] Implement HTML -> PDF rendering.
- [x] Use `printBackground: true`.
- [x] Use `preferCSSPageSize: true`.
- [x] Set global worker concurrency to 1.
- [x] Add render timeout.
- [x] Save `report.pdf`.
- [ ] Test rendering inside Docker.
- [x] Ensure Docker has sufficient `shm_size`.
- [x] Add integration test for sample PDF generation.

## Stage 9 - Network and Asset Safety

- [x] Ensure templates use only local assets.
- [x] Block external HTTP/HTTPS requests during Playwright rendering.
- [x] Fail the job if an external resource is requested.
- [x] Add clear error message for blocked external assets.
- [ ] Add test template or test case for blocked external URL.
- [x] Ensure user JSON cannot inject executable HTML.

## Stage 10 - Queue and Worker

- [x] Implement persistent SQLite-backed queue.
- [x] Implement worker loop.
- [x] Worker picks queued jobs one by one.
- [x] Worker marks jobs as `processing`.
- [x] Worker marks jobs as `done`.
- [x] Worker marks failed jobs as `failed`.
- [x] Add max retry count.
- [x] Add retry delay.
- [x] Add render timeout handling.
- [ ] Add tests for failed job flow.

## Stage 11 - Public PDF Endpoint

- [x] Implement `GET /r/:public_token.pdf`.
- [x] Return PDF with correct headers.
- [x] Return 404 for unknown token.
- [x] Return 404 for expired token.
- [x] Do not expose file paths.
- [x] Add tests for public PDF access.
- [x] Add tests for expired public link.

## Stage 12 - Debug Endpoints

- [x] Implement `GET /v1/reports/:job_id/html`.
- [x] Implement `GET /v1/reports/:job_id/pdf`.
- [x] Protect both endpoints with API key auth.
- [x] Enforce assistant ownership checks.
- [x] Return 404 or 403 where appropriate.
- [ ] Add tests for debug HTML access.
- [ ] Add tests for debug PDF access.

## Stage 13 - Retention Cleanup

- [x] Implement cleanup job.
- [x] Delete files older than `RETENTION_DAYS`.
- [x] Mark jobs as `expired` or remove old records.
- [x] Ensure expired public PDF links stop working.
- [x] Add manual cleanup script.
- [ ] Add tests for cleanup logic.

## Stage 14 - Documentation

- [x] Write README.md.
- [x] Add local development instructions.
- [x] Add Docker Compose instructions.
- [x] Add API key generation instructions.
- [x] Add assistant configuration instructions.
- [x] Add template creation instructions.
- [x] Add curl examples.
- [x] Add Caddy reverse proxy example.
- [x] Add troubleshooting section.

## Stage 15 - Final Verification

- [ ] Start the service with Docker Compose.
- [x] Generate an API key.
- [x] Configure one assistant.
- [x] Render sample report.
- [x] Poll job status.
- [x] Open generated public PDF URL.
- [ ] Open authenticated debug HTML endpoint.
- [x] Confirm files are saved under `data/jobs/`.
- [x] Confirm external network assets are blocked.
- [x] Confirm old files can be cleaned up manually.
- [ ] Confirm memory usage is acceptable on 2 GB RAM VPS.
