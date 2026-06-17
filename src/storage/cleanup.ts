import fs from 'node:fs';
import { JobsRepo } from '../db/repositories/jobs.repo.js';
import { nowIso } from '../utils/time.js';

export function cleanupExpiredJobs(repo: JobsRepo): number {
  const expired = repo.markExpiredBefore(nowIso());
  for (const job of expired) {
    for (const candidate of [job.input_json_path, job.rendered_html_path, job.pdf_path]) {
      if (candidate && fs.existsSync(candidate)) fs.rmSync(candidate, { force: true });
    }
  }
  return expired.length;
}

export function scheduleCleanup(repo: JobsRepo): NodeJS.Timeout {
  return setInterval(() => cleanupExpiredJobs(repo), 24 * 60 * 60 * 1000);
}
