import { openDb } from '../src/db/db.js';
import { JobsRepo } from '../src/db/repositories/jobs.repo.js';
import { cleanupExpiredJobs } from '../src/storage/cleanup.js';

const db = openDb();
const repo = new JobsRepo(db);
const count = cleanupExpiredJobs(repo);
console.log(`Expired jobs cleaned: ${count}`);
