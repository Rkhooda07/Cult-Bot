import cron from "node-cron";
import { Client, User } from "discord.js";
import { logger } from "../utils/logger";
import { prisma } from "../database/prisma";
import {
  getDueReminders,
  markReminderSent,
  formatReminderTime,
} from "../services/reminderService";

let isRunning = false;

/**
 * Reminder delivery cron job — runs every 60 seconds.
 *
 * Delivers due reminders via DM to each user (default choice per spec Section 2).
 * Each reminder is scoped to its user via Reminder.userId, so there's no
 * shared/global queue — the poller simply finds all unsent reminders where
 * remindAt <= now and delivers them individually.
 */
export function startReminderPoller(client: Client): void {
  cron.schedule("* * * * *", async () => {
    if (isRunning) {
      logger.debug("Reminder poller skipped — previous run still in progress");
      return;
    }

    isRunning = true;

    try {
      const due = await getDueReminders();

      if (due.length === 0) {
        logger.debug("No due reminders to deliver");
        return;
      }

      logger.info({ count: due.length }, "Delivering due reminders");

      for (const reminder of due) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: reminder.userId },
            select: { timezone: true, username: true },
          });

          if (!user) {
            logger.warn({ reminderId: reminder.id }, "User not found for reminder, marking sent");
            await markReminderSent(reminder.id);
            continue;
          }

          const timeStr = formatReminderTime(reminder.remindAt, user.timezone);

          const discordUser = await client.users.fetch(reminder.userId).catch(() => null);

          if (discordUser) {
            await discordUser
              .send({
                embeds: [
                  {
                    color: 0xe67e22,
                    title: "⏰ Reminder",
                    description: reminder.message,
                    fields: [{ name: "Time", value: timeStr, inline: true }],
                    footer: { text: "DevOS" },
                    timestamp: new Date().toISOString(),
                  },
                ],
              })
              .catch((err) => {
                logger.warn({ err, userId: reminder.userId }, "Failed to send reminder DM");
              });
          } else {
            logger.warn({ userId: reminder.userId }, "Could not fetch Discord user for reminder");
          }

          const marked = await markReminderSent(reminder.id);
          if (!marked) {
            logger.warn({ reminderId: reminder.id }, "Reminder already marked sent (race condition?)");
          }
        } catch (err) {
          logger.error({ err, reminderId: reminder.id }, "Error delivering reminder");
        }
      }
    } catch (err) {
      logger.error({ err }, "Error in reminder poller");
    } finally {
      isRunning = false;
    }
  });

  logger.info("Reminder poller started (every 60s)");
}