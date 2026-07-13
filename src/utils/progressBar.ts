/**
 * Progress bar utility — spec Section 6.3.
 *
 * @param percent  0–100 completion value
 * @param length   Total number of characters in the bar (default 10)
 * @returns        e.g. "███░░░░░░░" for 30 %
 *
 * Usage:
 *   progressBar(0)    → "░░░░░░░░░░"
 *   progressBar(50)   → "█████░░░░░"
 *   progressBar(100)  → "██████████"
 */
export function progressBar(percent: number, length = 10): string {
  const filled = Math.round((percent / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}
