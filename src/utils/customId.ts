/**
 * customId helpers — spec Section 6.4.
 *
 * Format: `domain:action:ownerId:entityId`
 * Example: `todo:complete:8213...:ckx91a...`
 *
 * - domain:  feature area ("todo", "goal", "ping", …)
 * - action:  what the interaction does ("complete", "delete", "pong", …)
 * - ownerId: Discord user id of the user who opened the panel
 * - entityId: DB id of the specific record, or "none" when not applicable
 *
 * The router in interactionCreate.ts decodes this and:
 *  1. Checks ownerId === interaction.user.id (ownership guard)
 *  2. Dispatches to the handler registered under "domain:action"
 */

export interface DecodedCustomId {
  domain: string;
  action: string;
  ownerId: string;
  entityId: string;
}

/**
 * Build a customId string from its four parts.
 *
 * @param entityId  Defaults to "none" when no specific record is targeted.
 */
export function encode(
  domain: string,
  action: string,
  ownerId: string,
  entityId = "none"
): string {
  return [domain, action, ownerId, entityId].join(":");
}

/**
 * Split a customId string back into its four parts.
 * Unknown / malformed ids return empty strings; callers should guard on domain.
 */
export function decode(customId: string): DecodedCustomId {
  const [domain = "", action = "", ownerId = "", entityId = "none"] =
    customId.split(":");
  return { domain, action, ownerId, entityId };
}
