import type { Worker } from './worker.js';

export function startJobQueue(worker: Worker): void {
  worker.start();
}
