import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Optional: higher GitHub API rate limits
  GITHUB_TOKEN: z.string().optional(),
  // Optional: public raw.githubusercontent.com URL to the committed bot icon,
  // used as the embed footer icon. Only works once the repo is pushed public;
  // leave unset otherwise — every consumer degrades gracefully when empty.
  BOT_ICON_URL: z.string().url().optional(),
  // Optional: when explicitly "true", the bot attempts to set its own avatar
  // once on startup. Discord rate-limits avatar changes heavily, so this is
  // opt-in and never retried — see .env.example and events/ready.ts.
  AUTO_SET_AVATAR: z.string().optional(),
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
