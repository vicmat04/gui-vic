// ──────────────────────────────────────────────────────────────────
// Rate limiter — in-process, per IP, sliding window
// ──────────────────────────────────────────────────────────────────

interface BucketEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, BucketEntry>();

const MAX = parseInt(process.env.RATE_LIMIT_MAX ?? "10");
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "900000");

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}
