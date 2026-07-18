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
 *   - ICON_URL: a public HTTPS URL Discord can fetch for embed footers. This
 *     is optional and may be empty — raw.githubusercontent.com can only serve
 *     the file once the repo is pushed to a PUBLIC GitHub repo. Consumers must
 *     treat an empty value as "no icon" and never crash on it.
 */

/** Absolute path to the 512px PNG on disk, for local file operations. */
export const ICON_LOCAL_PATH = path.join(
  process.cwd(),
  "src",
  "assets",
  "nerdcult-icon-512.png"
);

/**
 * Public URL to the committed icon, or "" when unset. Empty means the repo is
 * not (yet) public, or the operator has opted out — features must skip the
 * icon rather than fail. Example value:
 *   https://raw.githubusercontent.com/<owner>/<repo>/main/src/assets/nerdcult-icon-512.png
 */
export const ICON_URL = env.BOT_ICON_URL ?? "";
