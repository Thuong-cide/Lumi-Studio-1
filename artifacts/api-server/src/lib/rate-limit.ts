import type { Request } from "express";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
}

export function rateLimit(
  key: string,
  options: { windowMs: number; max: number }
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetTime < now) {
    store.set(key, { count: 1, resetTime: now + options.windowMs });
    return { success: true, remaining: options.max - 1, resetTime: now + options.windowMs };
  }

  if (entry.count >= options.max) {
    return { success: false, remaining: 0, resetTime: entry.resetTime };
  }

  entry.count++;
  return { success: true, remaining: options.max - entry.count, resetTime: entry.resetTime };
}

export function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ??
    (req.headers["x-real-ip"] as string) ??
    req.ip ??
    "unknown"
  );
}
