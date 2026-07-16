import * as chrono from "chrono-node";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma } from "../database/prisma";

export const reminderMessageSchema = z.string().min(1).max(200).trim();
export const reminderTimeSchema = z.string().min(1).max(100).trim();

export type ReminderMessage = z.infer<typeof reminderMessageSchema>;
export type ReminderTimeInput = z.infer<typeof reminderTimeSchema>;

export interface ReminderItem {
  id: string;
  userId: string;
  channelId: string;
  message: string;
  remindAt: Date;
  sent: boolean;
  createdAt: Date;
}

export interface PaginatedReminders {
  reminders: ReminderItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 10;

export async function ensureUser(userId: string, username: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: { username },
    create: { id: userId, username },
  });
}

export async function createReminder(
  userId: string,
  channelId: string,
  message: string,
  timeInput: string,
  timezone = "UTC"
): Promise<{ reminder: ReminderItem; parsedTime: Date } | { error: string }> {
  const results = chrono.parse(timeInput.trim(), DateTime.now().setZone(timezone).toJSDate(), {
    forwardDate: true,
  });

  if (results.length === 0) {
    return { error: "Could not parse time. Try formats like: '2h', 'tomorrow 8am', 'in 30 minutes', 'August 30'." };
  }

  const remindAt = results[0].start.date();

  if (remindAt <= new Date()) {
    return { error: "Reminder time must be in the future." };
  }

  const reminder = await prisma.reminder.create({
    data: {
      userId,
      channelId,
      message,
      remindAt,
    },
  });

  return {
    reminder: {
      id: reminder.id,
      userId: reminder.userId,
      channelId: reminder.channelId,
      message: reminder.message,
      remindAt: reminder.remindAt,
      sent: reminder.sent,
      createdAt: reminder.createdAt,
    },
    parsedTime: remindAt,
  };
}

export async function getRemindersPaginated(userId: string, page: number): Promise<PaginatedReminders> {
  const skip = (page - 1) * PAGE_SIZE;

  const [reminders, total] = await Promise.all([
    prisma.reminder.findMany({
      where: { userId, sent: false },
      orderBy: { remindAt: "asc" },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.reminder.count({ where: { userId, sent: false } }),
  ]);

  return {
    reminders: reminders.map((r) => ({
      id: r.id,
      userId: r.userId,
      channelId: r.channelId,
      message: r.message,
      remindAt: r.remindAt,
      sent: r.sent,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export async function getAllUpcomingReminders(userId: string): Promise<ReminderItem[]> {
  const reminders = await prisma.reminder.findMany({
    where: { userId, sent: false },
    orderBy: { remindAt: "asc" },
  });

  return reminders.map((r) => ({
    id: r.id,
    userId: r.userId,
    channelId: r.channelId,
    message: r.message,
    remindAt: r.remindAt,
    sent: r.sent,
    createdAt: r.createdAt,
  }));
}

export async function cancelReminder(userId: string, reminderId: string): Promise<boolean> {
  const result = await prisma.reminder.deleteMany({
    where: { id: reminderId, userId, sent: false },
  });

  return result.count > 0;
}

export async function getDueReminders(): Promise<ReminderItem[]> {
  const now = new Date();
  const reminders = await prisma.reminder.findMany({
    where: { sent: false, remindAt: { lte: now } },
    orderBy: { remindAt: "asc" },
  });

  return reminders.map((r) => ({
    id: r.id,
    userId: r.userId,
    channelId: r.channelId,
    message: r.message,
    remindAt: r.remindAt,
    sent: r.sent,
    createdAt: r.createdAt,
  }));
}

export async function markReminderSent(reminderId: string): Promise<boolean> {
  const result = await prisma.reminder.updateMany({
    where: { id: reminderId, sent: false },
    data: { sent: true },
  });

  return result.count > 0;
}

export function formatReminderTime(remindAt: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(remindAt, { zone: "utc" }).setZone(timezone);
  return dt.toFormat("MMM d, yyyy 'at' h:mm a");
}

export function formatReminderTimeShort(remindAt: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(remindAt, { zone: "utc" }).setZone(timezone);
  return dt.toFormat("MMM d, h:mm a");
}

export async function setUserTimezone(userId: string, timezone: string): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: { id: userId },
    data: { timezone },
  });
  return result.count > 0;
}

export function isValidIANATimezone(timezone: string): boolean {
  try {
    const dt = DateTime.now().setZone(timezone);
    return dt.isValid && dt.zone.type === "iana";
  } catch {
    return false;
  }
}

export async function getUserTimezone(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return user?.timezone || "UTC";
}

export async function getTodaysReminderCount(userId: string, timezone: string): Promise<number> {
  const now = DateTime.now().setZone(timezone);
  const startOfDay = now.startOf("day").toJSDate();
  const endOfDay = now.endOf("day").toJSDate();

  return prisma.reminder.count({
    where: {
      userId,
      sent: false,
      remindAt: { gte: startOfDay, lte: endOfDay },
    },
  });
}