import type { Db } from '../db.js';

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'expired';

export type Job = {
  id: string;
  external_id: string | null;
  assistant_id: string;
  template_id: string;
  template_version: string;
  status: JobStatus;
  public_token: string;
  public_url: string | null;
  input_json_path: string;
  rendered_html_path: string | null;
  pdf_path: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type NewJob = Omit<Job, 'rendered_html_path' | 'pdf_path' | 'error_code' | 'error_message' | 'attempts' | 'next_attempt_at'>;

export class JobsRepo {
  constructor(private db: Db) {}

  create(job: NewJob): void {
    this.db.prepare(`
      INSERT INTO jobs (
        id, external_id, assistant_id, template_id, template_version, status,
        public_token, public_url, input_json_path, created_at, updated_at, expires_at
      ) VALUES (
        @id, @external_id, @assistant_id, @template_id, @template_version, @status,
        @public_token, @public_url, @input_json_path, @created_at, @updated_at, @expires_at
      )
    `).run(job);
  }

  getById(id: string): Job | undefined {
    return this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Job | undefined;
  }

  getByPublicToken(token: string): Job | undefined {
    return this.db.prepare('SELECT * FROM jobs WHERE public_token = ?').get(token) as Job | undefined;
  }

  getNextQueued(nowIso: string): Job | undefined {
    return this.db.prepare(`
      SELECT * FROM jobs
      WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY created_at ASC
      LIMIT 1
    `).get(nowIso) as Job | undefined;
  }

  markProcessing(id: string, updatedAt: string): void {
    this.db.prepare(`
      UPDATE jobs SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ?
    `).run(updatedAt, id);
  }

  markQueuedForRetry(id: string, nextAttemptAt: string, updatedAt: string, message: string): void {
    this.db.prepare(`
      UPDATE jobs
      SET status = 'queued', next_attempt_at = ?, updated_at = ?, error_code = 'RENDER_FAILED', error_message = ?
      WHERE id = ?
    `).run(nextAttemptAt, updatedAt, message, id);
  }

  markDone(id: string, renderedHtmlPath: string, pdfPath: string, publicUrl: string, updatedAt: string): void {
    this.db.prepare(`
      UPDATE jobs
      SET status = 'done', rendered_html_path = ?, pdf_path = ?, public_url = ?, updated_at = ?,
          error_code = NULL, error_message = NULL
      WHERE id = ?
    `).run(renderedHtmlPath, pdfPath, publicUrl, updatedAt, id);
  }

  markFailed(id: string, code: string, message: string, updatedAt: string): void {
    this.db.prepare(`
      UPDATE jobs SET status = 'failed', error_code = ?, error_message = ?, updated_at = ? WHERE id = ?
    `).run(code, message, updatedAt, id);
  }

  markExpiredBefore(nowIso: string): Job[] {
    const jobs = this.db.prepare("SELECT * FROM jobs WHERE expires_at <= ? AND status != 'expired'").all(nowIso) as Job[];
    const update = this.db.prepare("UPDATE jobs SET status = 'expired', updated_at = ? WHERE id = ?");
    const tx = this.db.transaction((rows: Job[]) => {
      for (const job of rows) update.run(nowIso, job.id);
    });
    tx(jobs);
    return jobs;
  }
}
