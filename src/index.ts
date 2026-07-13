import { Client, GatewayIntentBits } from "discord.js";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { setClient } from "./utils/client";

// ── Import command modules (side-effect: registers into commands / buttonHandlers / …) ──
import "./commands/ping/ping";
import "./commands/todo/todo";
import "./commands/goal/goal";
import "./commands/reminders/remind";
import "./commands/settings/settings";
// Phase 1+: import "./commands/today/today";
import "./commands/today/today";
// Phase 2+: import "./commands/focus/focus";
import "./commands/focus/focus";
import "./commands/streak/streak";
import "./commands/stats/stats";
import "./commands/level/level";
import "./commands/badges/badges";
import "./commands/habits/habit";
// Phase 4: integrations
import "./commands/link/link";
import "./commands/dev-stats/devStats";

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      // Privileged intent — must also be enabled in the Discord Developer Portal
      // under Bot → Privileged Gateway Intents → Server Members Intent.
      // Required to resolve shared guilds for the activity broadcast system (Section 12).
      GatewayIntentBits.GuildMembers,
    ],
  });

  setClient(client);

  // Load event handlers
  const { registerReadyEvent } = await import("./events/ready");
  const { registerInteractionCreate } = await import("./events/interactionCreate");

  registerReadyEvent(client);
  registerInteractionCreate(client);

  // Start reminder poller (runs every 60s)
  const { startReminderPoller } = await import("./cron/reminderPoller");
  startReminderPoller(client);

  // Start streak check cron job (runs every hour)
  const { startStreakCheck } = await import("./cron/streakCheck");
  startStreakCheck(client);

  // Start GitHub activity poller (runs every 15 min)
  const { startGithubPoller } = await import("./cron/githubPoller");
  startGithubPoller(client);

  // Start LeetCode activity poller (runs every 15 min)
  const { startLeetcodePoller } = await import("./cron/leetcodePoller");
  startLeetcodePoller(client);

  // Start Codeforces activity poller (runs every 15 min)
  const { startCodeforcesPoller } = await import("./cron/codeforcesPoller");
  startCodeforcesPoller(client);

  await client.login(env.DISCORD_TOKEN);
}

main().catch((err) => {
  // Use console.error here since the logger init itself could be the crash
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
