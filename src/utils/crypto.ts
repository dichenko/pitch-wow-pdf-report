import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function verifySha256(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(sha256Hex(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateApiKey(): string {
  return `pw_live_${randomBytes(24).toString('hex')}`;
}

export function generatePublicToken(): string {
  return `pw_${randomBytes(24).toString('hex')}`;
}
