import { Client, GatewayIntentBits } from "discord.js";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { setClient } from "./utils/client";
import { startTimer, logTiming, timingEnabled } from "./utils/timing";

const processStart = startTimer();

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
// Phase 5: leaderboard, challenge
import "./commands/leaderboard/leaderboard";
import "./commands/challenge/challenge";
import "./commands/board/board";

async function main() {
  let stop = startTimer();

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
  logTiming("startup:client+events setup", stop());

  // Fire a trivial query now, in parallel with the gateway handshake below,
  // so a serverless DB (e.g. Neon) that auto-suspended on idle starts its
  // cold-start "wake" immediately instead of on the first real interaction.
  // Not awaited — must never block or fail startup.
  import("./database/prisma").then(({ prisma }) => {
    const dbStop = startTimer();
    prisma.$queryRaw`SELECT 1`
      .then(() => logTiming("startup:db warm-up query", dbStop()))
      .catch((err) => logger.warn({ err }, "DB warm-up query failed (non-fatal)"));
  });

  stop = startTimer();

  // Start reminder poller (runs every 60s)
  const { startReminderPoller } = await import("./cron/reminderPoller");
  startReminderPoller(client);

  // Start streak check cron job (runs every hour)
  const { startStreakCheck } = await import("./cron/streakCheck");
  startStreakCheck(client);

  // Start GitHub activity poller (runs every 2 min)
  const { startGithubPoller } = await import("./cron/githubPoller");
  startGithubPoller(client);

  // Start LeetCode activity poller (runs every 15 min)
  const { startLeetcodePoller } = await import("./cron/leetcodePoller");
  startLeetcodePoller(client);

  // Start Codeforces activity poller (runs every 15 min)
  const { startCodeforcesPoller } = await import("./cron/codeforcesPoller");
  startCodeforcesPoller(client);

  // Start Weekly Recap cron job (runs every hour)
  const { startWeeklyRecap } = await import("./cron/weeklyRecap");
  startWeeklyRecap(client);

  // Keep the DB connection warm so serverless Postgres (e.g. Neon) never
  // auto-suspends while the bot is running (see src/cron/dbKeepAlive.ts).
  const { startDbKeepAlive } = await import("./cron/dbKeepAlive");
  startDbKeepAlive();
  logTiming("startup:cron jobs registered", stop());

  stop = startTimer();
  await client.login(env.DISCORD_TOKEN);
  logTiming("startup:client.login (gateway handshake)", stop());

  if (timingEnabled) {
    client.once("ready", () => {
      logTiming("startup:process start -> ready", processStart());
    });
  }
}

main().catch((err) => {
  // Use console.error here since the logger init itself could be the crash
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
