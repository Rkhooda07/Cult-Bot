import { Client, GatewayIntentBits } from "discord.js";
import pino from "pino";
import { env } from "./config/env";

export const logger = pino({
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

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
  const { registerInteractionCreateEvent } = await import(
    "./events/interactionCreate"
  );

  registerReadyEvent(client, logger);
  registerInteractionCreateEvent(client, logger);

  await client.login(env.DISCORD_TOKEN);
}

main().catch((err) => {
  // Use console.error here since pino might not be initialised if the crash is very early
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
