import { Client } from "discord.js";

let discordClient: Client | null = null;

export function setClient(client: Client): void {
  discordClient = client;
}

export function getClient(): Client {
  if (!discordClient) {
    throw new Error("Discord client has not been set yet.");
  }
  return discordClient;
}
