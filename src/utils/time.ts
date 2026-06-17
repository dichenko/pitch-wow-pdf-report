export function nowIso(): string {
  return new Date().toISOString();
}

export function addDaysIso(date: Date, days: number): string {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString();
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}
