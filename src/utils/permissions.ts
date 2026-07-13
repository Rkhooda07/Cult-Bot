import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { decode } from "./customId";

/** Any component interaction that carries a domain:action:ownerId:entityId customId. */
type OwnerCheckableInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

/**
 * Verify that the user clicking / submitting owns the panel.
 *
 * Extracts `ownerId` from the `customId` (position 2 in the colon-separated string)
 * and compares it to `interaction.user.id`. If they don't match, replies ephemeral
 * "This isn't your panel." and returns `false` so the caller can early-return.
 *
 * Note: modals don't carry ownership in the same way, but we still run the check
 * for modal customIds that follow the convention — the pattern won't mis-fire for
 * domains that don't embed an ownerId (they'll just see an empty string mismatch).
 *
 * @example
 *   if (!(await assertOwner(interaction))) return;
 */
export async function assertOwner(
  interaction: OwnerCheckableInteraction
): Promise<boolean> {
  const { ownerId } = decode(interaction.customId);

  if (ownerId === "public") return true;
  if (interaction.user.id === ownerId) return true;

  await interaction.reply({
    content: "This isn't your panel.",
    ephemeral: true,
  });
  return false;
}
