import { Client, GatewayIntentBits } from "discord.js";
import { env } from "./config/env";
import { logger } from "./utils/logger";

// ── Import command modules (side-effect: registers into commands / buttonHandlers / …) ──
import "./commands/ping/ping";
import "./commands/todo/todo";
// Phase 1+: import "./commands/goal/goal";
// Phase 1+: import "./commands/remind/remind";
// Phase 1+: import "./commands/today/today";
// Phase 1+: import "./commands/settings/settings";

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

  // Load event handlers
  const { registerReadyEvent } = await import("./events/ready");
  const { registerInteractionCreate } = await import("./events/interactionCreate");

  registerReadyEvent(client);
  registerInteractionCreate(client);

  await client.login(env.DISCORD_TOKEN);
}

main().catch((err) => {
  // Use console.error here since the logger init itself could be the crash
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
