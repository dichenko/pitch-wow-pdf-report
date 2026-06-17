# Pitch-wow-pdf-report

Private PDF report generation service for internal AI assistants. An assistant sends an authorized JSON payload, the service validates it against the assistant's assigned template, renders HTML with Nunjucks, generates PDF through Playwright Chromium, stores artifacts for the retention window, and returns a public PDF link.

## Local Setup

```bash
npm install
Copy-Item config/assistants.example.json config/assistants.json
Copy-Item .env.example .env
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:8080/health
```

## API Keys

Generate a key:

```bash
npm run generate-api-key
```

Put only `Hash for config` into `config/assistants.json`. The plain key is shown once and is used by the calling assistant.

The example config accepts this local test key:

```text
pw_live_sample
```

## Add an Assistant

Edit `config/assistants.json`:

```json
{
  "assistant_id": "sample_assistant",
  "name": "Sample Founder Interview Assistant",
  "active": true,
  "api_key_hash": "sha256_hash_here",
  "default_template_id": "sample_founder_report",
  "default_template_version": "v1",
  "rate_limit_per_minute": 10
}
```

## Add a Template

Create a self-contained version directory:

```text
templates/my_template/v1/
  template.config.json
  schema.json
  template.html.njk
  styles.css
  sample.json
  prompt.md
  assets/
```

Changing JSON shape requires a new version such as `v2`. Minor visual changes can stay in the same version.

## Render a Sample

```bash
npm run render:sample -- united_ventures_dossier v1
```

Output:

```text
data/sample-renders/united_ventures_dossier/v1/rendered.html
data/sample-renders/united_ventures_dossier/v1/report.pdf
```

## Create a Report

```bash
curl -X POST http://127.0.0.1:8080/v1/reports `
  -H "Authorization: Bearer pw_live_sample" `
  -H "Content-Type: application/json" `
  -d "@templates/united_ventures_dossier/v1/sample.json"
```

Response contains `job_id` and `status_url`. Poll every 10 seconds:

```bash
curl http://127.0.0.1:8080/v1/reports/job_xxx `
  -H "Authorization: Bearer pw_live_sample"
```

When done, the response includes `pdf_url`.

Private debug endpoints:

```bash
curl http://127.0.0.1:8080/v1/reports/job_xxx/html -H "Authorization: Bearer pw_live_sample"
curl http://127.0.0.1:8080/v1/reports/job_xxx/pdf -H "Authorization: Bearer pw_live_sample" --output report.pdf
```

## Docker Compose

Prepare `.env` and `config/assistants.json`, then:

```bash
docker compose up -d --build
curl http://127.0.0.1:18080/health
```

The compose file exposes only localhost:

```yaml
ports:
  - "127.0.0.1:18080:8080"
```

## External Caddy

Caddy is managed outside this repository. Example:

```caddyfile
pdf-api.example.com {
  reverse_proxy 127.0.0.1:18080
}
```

Set `PUBLIC_BASE_URL=https://pdf-api.example.com` in `.env` so generated public links use the external domain.

## Retention

Generated files are stored under:

```text
data/jobs/{assistant_id}/{yyyy-mm}/{job_id}/
```

Default retention is 30 days via `RETENTION_DAYS=30`. Expired jobs stop serving public PDFs. Manual cleanup:

```bash
npm run cleanup
```

## Troubleshooting

- `UNAUTHORIZED`: missing or wrong bearer token.
- `VALIDATION_ERROR`: payload does not match the assigned template schema.
- `TEMPLATE_NOT_FOUND`: assistant points to a missing template/version.
- `RENDER_FAILED`: inspect `data/jobs/.../error.log` and the debug HTML endpoint.
- Chromium memory pressure: keep `WORKER_CONCURRENCY=1` and Docker `shm_size: "512mb"`.
