import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Optional at boot, but required in practice for the GitHub integration to
  // work: the poller runs every 2 minutes, and unauthenticated REST is capped
  // at 60 requests/hour. Deliberately NOT required — GitHub is one opt-in
  // feature, so a missing token must not stop the bot starting. githubPoller.ts
  // logs a warning at startup when it is unset.
  GITHUB_TOKEN: z.string().optional(),
  // Optional override for the embed footer icon. Normally unset — branding.ts
  // falls back to the bot's own Discord-hosted avatar, which needs no config.
  //
  // The empty string is normalized to undefined BEFORE the url check, because
  // `BOT_ICON_URL=` in a .env file is the obvious way to express "off" and must
  // not be fatal. Without this, .optional() only permits the variable being
  // absent — a bare `BOT_ICON_URL=` parses as "" , fails .url(), and takes the
  // whole bot down at boot over a cosmetic footer icon. A non-empty non-URL is
  // still rejected: that's a typo, not an opt-out.
  BOT_ICON_URL: z
    .string()
    .transform((v) => (v.trim() === "" ? undefined : v))
    .pipe(z.string().url().optional())
    .optional(),
  // Optional: when explicitly "true", the bot attempts to set its own avatar
  // once on startup. Discord rate-limits avatar changes heavily, so this is
  // opt-in and never retried — see .env.example and events/ready.ts.
  AUTO_SET_AVATAR: z.string().optional(),
  // Port for the health endpoint (src/server/healthServer.ts). Injected by the
  // hosting platform — Koyeb sets PORT=8000 — so it is a string here and is
  // coerced, not required. 8000 matches Koyeb's default so local and deployed
  // behaviour agree. Never bind this to a fixed literal: a platform that picks
  // its own port will fail every health check against a hardcoded one.
  PORT: z.coerce.number().int().positive().default(8000),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `\n\nMissing or invalid environment variables:\n${missing}\n\nCopy .env.example to .env and fill in the values.\n`
    );
  }

  return result.data;
}

export const env = validateEnv();
