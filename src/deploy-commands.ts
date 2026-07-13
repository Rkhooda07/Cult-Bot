/**
 * deploy-commands.ts
 *
 * Registers slash commands with Discord's API via the REST client.
 * Run this once after changing any command definitions:
 *
 *   npx ts-node src/deploy-commands.ts
 *   # or after building:
 *   node dist/deploy-commands.js
 *
 * Guild-scoped deployment (instant, dev-only):
 *   GUILD_ID=<your_test_guild_id> npx ts-node src/deploy-commands.ts
 *
 * Global deployment (up to 1 hour to propagate — use for production):
 *   npx ts-node src/deploy-commands.ts
 *
 * Commands are discovered by importing each command module here (side-effect
 * registration into the `commands` Map in src/registry.ts).
 * Add a new import line each time you add a new command.
 */

import { REST, Routes } from "discord.js";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { commands } from "./registry";

// ── Import every command module here so they self-register ─────────────────
import "./commands/ping/ping";
import "./commands/todo/todo";
import "./commands/goal/goal";
// Phase 1+: import "./commands/remind/remind";
// Phase 1+: import "./commands/today/today";
// Phase 1+: import "./commands/settings/settings";
// (add more as phases are built)

// ---------------------------------------------------------------------------

async function deployCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

  const body = [...commands.values()].map((c) => c.data.toJSON());
  const guildId = process.env.GUILD_ID;

  if (guildId) {
    // Guild-scoped: instant, ideal for development
    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId),
      { body }
    );
    logger.info(
      { guildId, count: body.length },
      "Guild-scoped commands deployed (instant)"
    );
  } else {
    // Global: propagates to all guilds in ~1 hour
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
      body,
    });
    logger.info({ count: body.length }, "Global commands deployed");
  }

  logger.info(
    { commands: [...commands.keys()] },
    "Registered command names"
  );
}

deployCommands().catch((err: unknown) => {
  logger.error({ err }, "Failed to deploy commands");
  process.exit(1);
});
