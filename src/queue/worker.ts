import fs from 'node:fs';
import path from 'node:path';
import type { TemplateRegistry } from '../config/templates.js';
import type { JobsRepo, Job } from '../db/repositories/jobs.repo.js';
import { renderReport } from '../renderer/renderReport.js';
import { writeText } from '../storage/storage.js';
import { env } from '../config/env.js';
import { nowIso } from '../utils/time.js';
import { logger } from '../utils/logger.js';

export class Worker {
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private repo: JobsRepo,
    private templates: TemplateRegistry
  ) {}

  start(intervalMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const job = this.repo.getNextQueued(nowIso());
      if (job) await this.process(job);
    } finally {
      this.running = false;
    }
  }

  private async process(job: Job): Promise<void> {
    const started = Date.now();
    this.repo.markProcessing(job.id, nowIso());
    try {
      const template = this.templates.get(job.template_id, job.template_version);
      if (!template) throw new Error(`Template not found: ${job.template_id}/${job.template_version}`);
      const payload = JSON.parse(fs.readFileSync(job.input_json_path, 'utf8'));
      const outputDir = path.dirname(job.input_json_path);
      const result = await renderReport(template, payload, outputDir, env.JOB_TIMEOUT_SECONDS * 1000);
      this.repo.markDone(job.id, result.renderedHtmlPath, result.pdfPath, job.public_url ?? '', nowIso());
      logger.info({ job_id: job.id, duration_ms: Date.now() - started }, 'render job completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF rendering failed';
      const errorLogPath = path.join(path.dirname(job.input_json_path), 'error.log');
      writeText(errorLogPath, message);
      if (job.attempts < env.JOB_MAX_RETRIES) {
        const next = new Date(Date.now() + env.JOB_RETRY_DELAY_SECONDS * 1000).toISOString();
        this.repo.markQueuedForRetry(job.id, next, nowIso(), message);
      } else {
        this.repo.markFailed(job.id, 'RENDER_FAILED', 'PDF rendering failed', nowIso());
      }
      logger.error({ job_id: job.id, err: message, duration_ms: Date.now() - started }, 'render job failed');
    }
  }
}
