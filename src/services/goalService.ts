import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import * as chrono from "chrono-node";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

export const goalTitleSchema = z.string().min(1).max(100).trim();
export const goalProgressSchema = z.coerce.number().min(0).max(100);
export const goalDeadlineSchema = z.string().optional();

export type GoalTitle = z.infer<typeof goalTitleSchema>;
export type GoalProgress = z.infer<typeof goalProgressSchema>;

export interface GoalItem {
  id: string;
  title: string;
  deadline: Date | null;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  progress: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface PaginatedGoals {
  goals: GoalItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 8;

export async function ensureUser(userId: string, username: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: { username },
    create: { id: userId, username },
  });
}

export async function createGoal(
  userId: string,
  title: string,
  deadlineStr?: string
): Promise<GoalItem> {
  let deadline: Date | null = null;

  if (deadlineStr && deadlineStr.trim()) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const timezone = user?.timezone || "UTC";

    const results = chrono.parse(deadlineStr.trim(), DateTime.now().setZone(timezone).toJSDate(), {
      forwardDate: true,
    });
    if (results.length > 0) {
      deadline = results[0].start.date();
    }
  }

  const goal = await prisma.goal.create({
    data: {
      userId,
      title,
      deadline,
    },
  });

  return {
    id: goal.id,
    title: goal.title,
    deadline: goal.deadline,
    status: goal.status,
    progress: goal.progress,
    createdAt: goal.createdAt,
    completedAt: goal.completedAt,
  };
}

export async function getGoalsPaginated(userId: string, page: number): Promise<PaginatedGoals> {
  const skip = (page - 1) * PAGE_SIZE;

  const [goals, total] = await Promise.all([
    prisma.goal.findMany({
      where: { userId },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      skip,
      take: PAGE_SIZE,
    }),
    prisma.goal.count({ where: { userId } }),
  ]);

  return {
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      deadline: g.deadline,
      status: g.status,
      progress: g.progress,
      createdAt: g.createdAt,
      completedAt: g.completedAt,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export async function getAllGoals(userId: string): Promise<GoalItem[]> {
  const goals = await prisma.goal.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  return goals.map((g) => ({
    id: g.id,
    title: g.title,
    deadline: g.deadline,
    status: g.status,
    progress: g.progress,
    createdAt: g.createdAt,
    completedAt: g.completedAt,
  }));
}

export async function getInProgressGoals(userId: string): Promise<GoalItem[]> {
  const goals = await prisma.goal.findMany({
    where: { userId, status: "IN_PROGRESS" },
    orderBy: { createdAt: "asc" },
  });

  return goals.map((g) => ({
    id: g.id,
    title: g.title,
    deadline: g.deadline,
    status: g.status,
    progress: g.progress,
    createdAt: g.createdAt,
    completedAt: g.completedAt,
  }));
}

export async function updateGoalProgress(
  userId: string,
  goalId: string,
  progress: number
): Promise<boolean> {
  const status = progress >= 100 ? "COMPLETED" : "IN_PROGRESS";
  const completedAt = progress >= 100 ? new Date() : null;

  const result = await prisma.goal.updateMany({
    where: { id: goalId, userId },
    data: { progress, status, completedAt },
  });

  return result.count > 0;
}

export async function completeGoal(userId: string, goalId: string): Promise<boolean> {
  const result = await prisma.goal.updateMany({
    where: { id: goalId, userId, status: "IN_PROGRESS" },
    data: { status: "COMPLETED", progress: 100, completedAt: new Date() },
  });

  return result.count > 0;
}

export async function abandonGoal(userId: string, goalId: string): Promise<boolean> {
  const result = await prisma.goal.updateMany({
    where: { id: goalId, userId, status: "IN_PROGRESS" },
    data: { status: "ABANDONED" },
  });

  return result.count > 0;
}

export async function deleteGoal(userId: string, goalId: string): Promise<boolean> {
  const result = await prisma.goal.deleteMany({
    where: { id: goalId, userId },
  });

  return result.count > 0;
}

export async function getGoalStats(userId: string): Promise<{
  total: number;
  inProgress: number;
  completed: number;
  abandoned: number;
}> {
  const [total, inProgress, completed, abandoned] = await Promise.all([
    prisma.goal.count({ where: { userId } }),
    prisma.goal.count({ where: { userId, status: "IN_PROGRESS" } }),
    prisma.goal.count({ where: { userId, status: "COMPLETED" } }),
    prisma.goal.count({ where: { userId, status: "ABANDONED" } }),
  ]);

  return { total, inProgress, completed, abandoned };
}

export function getStatusIcon(status: GoalItem["status"]): string {
  switch (status) {
    case "IN_PROGRESS":
      return "⏳";
    case "COMPLETED":
      return "✔";
    case "ABANDONED":
      return "⭕";
    default:
      return "⏳";
  }
}

export function getStatusLabel(status: GoalItem["status"]): string {
  switch (status) {
    case "IN_PROGRESS":
      return "In Progress";
    case "COMPLETED":
      return "Complete";
    case "ABANDONED":
      return "Abandoned";
    default:
      return "Unknown";
  }
}

export function formatDeadline(deadline: Date | null, timezone: string): string {
  if (!deadline) return "No deadline";

  const dt = DateTime.fromJSDate(deadline, { zone: "utc" }).setZone(timezone);
  return dt.toFormat("MMM d, yyyy");
}

export async function getAverageInProgressProgress(userId: string): Promise<number> {
  const goals = await prisma.goal.findMany({
    where: { userId, status: "IN_PROGRESS" },
    select: { progress: true },
  });

  if (goals.length === 0) return 0;

  const sum = goals.reduce((acc, g) => acc + g.progress, 0);
  return Math.round(sum / goals.length);
}