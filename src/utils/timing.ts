import { logger } from "./logger";

/**
 * Lightweight perf-timing helpers, gated behind DEBUG_TIMING=true.
 * Zero overhead when disabled (no timers started, no log calls made).
 */
export const timingEnabled = process.env.DEBUG_TIMING === "true";

export function startTimer(): () => number {
  if (!timingEnabled) return () => 0;
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1_000_000; // ms
}

export function logTiming(label: string, ms: number, extra?: Record<string, unknown>): void {
  if (!timingEnabled) return;
  logger.debug({ ...extra, ms: Math.round(ms * 100) / 100 }, `[timing] ${label}`);
}

/** Wraps an async fn, logging its duration under `label` when DEBUG_TIMING is set. */
export async function timed<T>(label: string, fn: () => Promise<T>, extra?: Record<string, unknown>): Promise<T> {
  if (!timingEnabled) return fn();
  const stop = startTimer();
  try {
    return await fn();
  } finally {
    logTiming(label, stop(), extra);
  }
}
