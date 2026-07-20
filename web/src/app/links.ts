/**
 * External destinations, both awaiting real values. Unset, they link to "#"
 * and warn once in dev rather than shipping a fabricated URL.
 */
export const INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
export const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL;

if (process.env.NODE_ENV === "development") {
  const missing = [
    !INVITE_URL && "NEXT_PUBLIC_DISCORD_INVITE_URL",
    !GITHUB_URL && "NEXT_PUBLIC_GITHUB_URL",
  ].filter(Boolean);

  if (missing.length > 0) {
    console.warn(
      `[CultBot] Unset, linking to "#": ${missing.join(", ")} — set them in .env.local`,
    );
  }
}
