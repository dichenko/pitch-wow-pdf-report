import path from 'node:path';

export function jobDir(dataDir: string, assistantId: string, jobId: string, createdAt: Date): string {
  const month = `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
  return path.join(dataDir, 'jobs', assistantId, month, jobId);
}
