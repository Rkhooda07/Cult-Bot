import { prisma } from "../database/prisma";
import { DateTime } from "luxon";
import { logger } from "../utils/logger";
import { getUserTimezone } from "./reminderService";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const CACHE_TTL_HOURS = 24;
const COACH_MODEL = "claude-3-5-sonnet-20241022";

function hashData(data: object): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function gatherUserData(userId: string) {
  const timezone = await getUserTimezone(userId);
  const now = DateTime.now().setZone(timezone);
  const sevenDaysAgo = now.minus({ days: 7 }).startOf("day").toJSDate();

  const [
    todosLast7Days,
    completedTodosLast7Days,
    pomodoroSessionsLast7Days,
    inProgressGoals,
  ] = await Promise.all([
    prisma.todo.findMany({
      where: { userId, createdAt: { gte: sevenDaysAgo } },
      select: { done: true, createdAt: true, doneAt: true },
    }),
    prisma.todo.findMany({
      where: { userId, done: true, doneAt: { gte: sevenDaysAgo } },
      select: { doneAt: true },
    }),
    prisma.pomodoroSession.findMany({
      where: {
        userId,
        status: "COMPLETED",
        startedAt: { gte: sevenDaysAgo },
      },
      select: { startedAt: true, durationMin: true },
    }),
    prisma.goal.findMany({
      where: { userId, status: "IN_PROGRESS", deadline: { not: null } },
      select: { id: true, title: true, deadline: true, progress: true },
    }),
  ]);

  const totalTodos = todosLast7Days.length;
  const completedTodos = completedTodosLast7Days.length;
  const completionRate = totalTodos === 0 ? 0 : Math.round((completedTodos / totalTodos) * 100);

  const hourCounts = new Map<number, number>();
  for (const session of pomodoroSessionsLast7Days) {
    const hour = DateTime.fromJSDate(session.startedAt).setZone(timezone).hour;
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }
  let mostProductiveHour: number | null = null;
  let maxSessions = 0;
  for (const [hour, count] of hourCounts.entries()) {
    if (count > maxSessions) {
      maxSessions = count;
      mostProductiveHour = hour;
    }
  }

  const goalsNearingDeadline = inProgressGoals
    .filter((g) => g.deadline && DateTime.fromJSDate(g.deadline).diff(now, "days").days <= 3)
    .map((g) => ({ title: g.title, deadline: g.deadline!.toISOString(), progress: g.progress }))
    .slice(0, 3);

  return {
    completionRate,
    totalTodos,
    completedTodos,
    mostProductiveHour,
    goalsNearingDeadline,
  };
}

async function callAnthropic(data: Awaited<ReturnType<typeof gatherUserData>>): Promise<string> {
  const prompt = `Given this user's task completion data ${JSON.stringify(data)}, write a 3-sentence, encouraging productivity coaching note. Mention one concrete task they should prioritize today. Keep it under 60 words.`;

  const response = await anthropic.messages.create({
    model: COACH_MODEL,
    max_tokens: 100,
    temperature: 0.7,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return text.trim();
}

async function getCachedResponse(userId: string, dataHash: string): Promise<string | null> {
  const cache = await prisma.coachCache.findUnique({ where: { userId } });
  if (!cache) return null;

  const ageHours = DateTime.now().diff(DateTime.fromJSDate(cache.updatedAt), "hours").hours;
  if (ageHours >= CACHE_TTL_HOURS) return null;
  if (cache.dataHash !== dataHash) return null;

  logger.info({ userId }, "Coach cache hit");
  return cache.response;
}

async function setCachedResponse(userId: string, dataHash: string, response: string): Promise<void> {
  await prisma.coachCache.upsert({
    where: { userId },
    create: { userId, response, dataHash },
    update: { response, dataHash },
  });
}

export async function getCoachNote(userId: string): Promise<string> {
  const data = await gatherUserData(userId);
  const dataHash = hashData(data);

  const cached = await getCachedResponse(userId, dataHash);
  if (cached) return cached;

  logger.info({ userId }, "Generating new coach response via Anthropic");
  const response = await callAnthropic(data);
  await setCachedResponse(userId, dataHash, response);
  return response;
}