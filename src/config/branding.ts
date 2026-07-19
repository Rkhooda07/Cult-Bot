import path from "path";
import { env } from "./env";

/**
 * Branding assets wiring — see src/assets/ for the source files.
 *
 * Two ways the icon reaches Discord:
 *   - ICON_LOCAL_PATH: a file on disk, used for local operations like
 *     client.user.setAvatar(). Anchored on process.cwd() (the project root,
 *     from which both `npm run dev` and `npm start` launch) because the build
 *     step does not copy src/assets into dist/.
 *   - getIconUrl(): a public HTTPS URL Discord can fetch for embed footers.
 *
 * The URL is resolved in priority order:
 *   1. BOT_ICON_URL, when the operator explicitly sets one.
 *   2. The bot's own avatar, hosted by Discord's CDN and registered at ready.
 *   3. "" — no icon; consumers omit the field rather than failing.
 *
 * Step 2 exists because step 1 alone left the icon permanently missing. It was
 * documented as "set BOT_ICON_URL to a raw.githubusercontent.com link", but
 * that only serves files from a PUBLIC repo — so on a private repo (the state
 * this project is actually in) there is no value that works, and every embed
 * silently rendered a text-only footer. The bot's avatar is already a public,
 * permanent, CDN-hosted image of the exact same icon, so it needs no repo
 * visibility change, no manual CDN step, and no configuration at all.
 */

/** Absolute path to the 512px PNG on disk, for local file operations. */
export const ICON_LOCAL_PATH = path.join(
  process.cwd(),
  "src",
  "assets",
  "nerdcult-icon-512.png"
);

/**
 * The bot's own avatar URL, populated once at ready. Module-level mutable state
 * is deliberate: createEmbed() is called from dozens of sites and threading a
 * Client through all of them to read one stable string would be far worse. It
 * is written exactly once, before any command can run.
 */
let botAvatarUrl = "";

/** Register the bot's Discord-hosted avatar URL. Called once from the ready event. */
export function setBotAvatarUrl(url: string | null): void {
  botAvatarUrl = url ?? "";
}

/**
 * Resolve the footer icon URL, or "" when none is available. Must be called at
 * embed-build time rather than read once at import time — the avatar fallback
 * is not known until ready fires.
 */
export function getIconUrl(): string {
  return env.BOT_ICON_URL ?? botAvatarUrl;
}
