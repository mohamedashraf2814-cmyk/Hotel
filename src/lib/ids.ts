let fallbackCounter = 0;

/** Generates a unique id. Uses crypto.randomUUID when available. */
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  fallbackCounter += 1;
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${fallbackCounter}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
