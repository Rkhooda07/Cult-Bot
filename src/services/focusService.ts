import { z } from "zod";
import { prisma } from "../database/prisma";
import { updateStreak } from "./streakService";

export const focusDurationSchema = z.coerce.number().int().min(1).max(180).default(25);

export type FocusDuration = z.infer<typeof focusDurationSchema>;

export interface PomodoroSessionItem {
  id: string;
  userId: string;
  durationMin: number;
  startedAt: Date;
  completedAt: Date | null;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
}

export async function ensureUser(userId: string, username: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: { username },
    create: { id: userId, username },
  });
}

/**
 * Grace window after a session's scheduled end during which the user can
 * still press "Mark Complete". Past it the session is considered stale.
 */
const COMPLETION_GRACE_MS = 30 * 60 * 1000;

/**
 * Close out IN_PROGRESS sessions whose end time (plus grace) has passed.
 * Run before checking for an active session so abandoned timers never
 * block a new `/focus start`. Returns how many sessions were expired.
 */
export async function expireStaleSessions(userId: string): Promise<number> {
  const sessions = await prisma.pomodoroSession.findMany({
    where: { userId, status: "IN_PROGRESS" },
    select: { id: true, startedAt: true, durationMin: true },
  });

  const now = Date.now();
  const staleIds = sessions
    .filter((s) => s.startedAt.getTime() + s.durationMin * 60 * 1000 + COMPLETION_GRACE_MS < now)
    .map((s) => s.id);

  if (staleIds.length === 0) return 0;

  const result = await prisma.pomodoroSession.updateMany({
    where: { id: { in: staleIds }, status: "IN_PROGRESS" },
    data: { status: "ABANDONED", completedAt: new Date() },
  });

  return result.count;
}

export async function getActiveSession(userId: string): Promise<PomodoroSessionItem | null> {
  const session = await prisma.pomodoroSession.findFirst({
    where: { userId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
  });

  if (!session) return null;

  return {
    id: session.id,
    userId: session.userId,
    durationMin: session.durationMin,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    status: session.status,
  };
}

export async function createSession(userId: string, durationMin: number): Promise<PomodoroSessionItem> {
  const session = await prisma.pomodoroSession.create({
    data: {
      userId,
      durationMin,
      status: "IN_PROGRESS",
    },
  });

  return {
    id: session.id,
    userId: session.userId,
    durationMin: session.durationMin,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    status: session.status,
  };
}

export async function completeSession(sessionId: string, userId: string): Promise<PomodoroSessionItem | null> {
  const session = await prisma.pomodoroSession.updateMany({
    where: { id: sessionId, userId, status: "IN_PROGRESS" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  if (session.count === 0) return null;

  await updateStreak(userId);

  const updated = await prisma.pomodoroSession.findUnique({ where: { id: sessionId } });
  if (!updated) return null;

  return {
    id: updated.id,
    userId: updated.userId,
    durationMin: updated.durationMin,
    startedAt: updated.startedAt,
    completedAt: updated.completedAt,
    status: updated.status,
  };
}

/**
 * Abandon ALL of the user's IN_PROGRESS sessions, not just the latest —
 * historical bugs left multiple stuck rows per user, and `/focus stop`
 * must always leave the user with a clean slate. Returns the number of
 * sessions closed (0 = nothing was running).
 */
export async function stopAllSessions(userId: string): Promise<number> {
  const result = await prisma.pomodoroSession.updateMany({
    where: { userId, status: "IN_PROGRESS" },
    data: { status: "ABANDONED", completedAt: new Date() },
  });

  return result.count;
}

export async function getSessionStats(userId: string): Promise<{
  total: number;
  completed: number;
  abandoned: number;
  totalMinutes: number;
}> {
  const [total, completed, abandoned, minutes] = await Promise.all([
    prisma.pomodoroSession.count({ where: { userId } }),
    prisma.pomodoroSession.count({ where: { userId, status: "COMPLETED" } }),
    prisma.pomodoroSession.count({ where: { userId, status: "ABANDONED" } }),
    prisma.pomodoroSession.aggregate({
      where: { userId, status: "COMPLETED" },
      _sum: { durationMin: true },
    }),
  ]);

  return {
    total,
    completed,
    abandoned,
    totalMinutes: minutes._sum.durationMin || 0,
  };
}