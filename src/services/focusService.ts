import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

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

export async function abandonSession(sessionId: string, userId: string): Promise<PomodoroSessionItem | null> {
  const session = await prisma.pomodoroSession.updateMany({
    where: { id: sessionId, userId, status: "IN_PROGRESS" },
    data: { status: "ABANDONED", completedAt: new Date() },
  });

  if (session.count === 0) return null;

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