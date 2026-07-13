import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  SlashCommandBuilder,
} from "discord.js";

// ---------------------------------------------------------------------------
// Handler types
// ---------------------------------------------------------------------------

export type CommandExecutor = (
  interaction: ChatInputCommandInteraction
) => Promise<void>;

export type ButtonExecutor = (
  interaction: ButtonInteraction
) => Promise<void>;

export type SelectExecutor = (
  interaction: StringSelectMenuInteraction
) => Promise<void>;

export type ModalExecutor = (
  interaction: ModalSubmitInteraction
) => Promise<void>;

// ---------------------------------------------------------------------------
// Registered command shape
// ---------------------------------------------------------------------------

export interface RegisteredCommand {
  /** The SlashCommandBuilder that defines this command's metadata for Discord. */
  data: SlashCommandBuilder;
  /** Called by the router when the command is received. */
  execute: CommandExecutor;
}

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

/**
 * Slash command registry.
 * Key: command name (e.g. "ping")
 * Populated by each command module as a side-effect of import.
 */
export const commands = new Map<string, RegisteredCommand>();

/**
 * Button handler registry.
 * Key: "domain:action" (first two segments of the customId).
 * The router matches buttons here after verifying ownership.
 */
export const buttonHandlers = new Map<string, ButtonExecutor>();

/**
 * String select menu handler registry.
 * Key: "domain:action".
 */
export const selectHandlers = new Map<string, SelectExecutor>();

/**
 * Modal submit handler registry.
 * Key: "domain:action".
 * Note: ownership for modals follows the same customId convention but the
 * check is skipped for modal submits where ownerId is not embedded.
 */
export const modalHandlers = new Map<string, ModalExecutor>();
