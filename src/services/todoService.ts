import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { DateTime } from "luxon";
import { updateStreak } from "./streakService";

const prisma = new PrismaClient();

export const todoContentSchema = z.string().min(1).max(200);

export type TodoContent = z.infer<typeof todoContentSchema>;

export interface TodoItem {
  id: string;
  content: string;
  done: boolean;
  createdAt: Date;
  doneAt: Date | null;
  dueDate: Date | null;
}

export interface PaginatedTodos {
  todos: TodoItem[];
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

export async function createTodo(userId: string, content: string): Promise<TodoItem> {
  const todo = await prisma.todo.create({
    data: {
      userId,
      content,
    },
  });

  return {
    id: todo.id,
    content: todo.content,
    done: todo.done,
    createdAt: todo.createdAt,
    doneAt: todo.doneAt,
    dueDate: todo.dueDate,
  };
}

export async function getTodosPaginated(userId: string, page: number): Promise<PaginatedTodos> {
  const skip = (page - 1) * PAGE_SIZE;

  const [todos, total] = await Promise.all([
    prisma.todo.findMany({
      where: { userId },
      orderBy: [{ done: "asc" }, { createdAt: "asc" }],
      skip,
      take: PAGE_SIZE,
    }),
    prisma.todo.count({ where: { userId } }),
  ]);

  return {
    todos: todos.map((t) => ({
      id: t.id,
      content: t.content,
      done: t.done,
      createdAt: t.createdAt,
      doneAt: t.doneAt,
      dueDate: t.dueDate,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export async function getAllTodos(userId: string): Promise<TodoItem[]> {
  const todos = await prisma.todo.findMany({
    where: { userId },
    orderBy: [{ done: "asc" }, { createdAt: "asc" }],
  });

  return todos.map((t) => ({
    id: t.id,
    content: t.content,
    done: t.done,
    createdAt: t.createdAt,
    doneAt: t.doneAt,
    dueDate: t.dueDate,
  }));
}

export async function getIncompleteTodos(userId: string): Promise<TodoItem[]> {
  const todos = await prisma.todo.findMany({
    where: { userId, done: false },
    orderBy: { createdAt: "asc" },
  });

  return todos.map((t) => ({
    id: t.id,
    content: t.content,
    done: t.done,
    createdAt: t.createdAt,
    doneAt: t.doneAt,
    dueDate: t.dueDate,
  }));
}

export async function completeTodo(userId: string, todoId: string): Promise<boolean> {
  const result = await prisma.todo.updateMany({
    where: { id: todoId, userId, done: false },
    data: { done: true, doneAt: new Date() },
  });

  if (result.count > 0) {
    await updateStreak(userId);
  }

  return result.count > 0;
}

export async function editTodo(userId: string, todoId: string, content: string): Promise<boolean> {
  const result = await prisma.todo.updateMany({
    where: { id: todoId, userId },
    data: { content },
  });

  return result.count > 0;
}

export async function deleteTodo(userId: string, todoId: string): Promise<boolean> {
  const result = await prisma.todo.deleteMany({
    where: { id: todoId, userId },
  });

  return result.count > 0;
}

export async function getTodoStats(userId: string): Promise<{ total: number; completed: number; percent: number }> {
  const [total, completed] = await Promise.all([
    prisma.todo.count({ where: { userId } }),
    prisma.todo.count({ where: { userId, done: true } }),
  ]);

  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { total, completed, percent };
}

export async function getTodaysOpenTodos(userId: string, timezone: string): Promise<TodoItem[]> {
  const now = DateTime.now().setZone(timezone);
  const startOfDay = now.startOf("day").toJSDate();
  const endOfDay = now.endOf("day").toJSDate();

  const todos = await prisma.todo.findMany({
    where: {
      userId,
      done: false,
      OR: [
        { dueDate: { gte: startOfDay, lte: endOfDay } },
        { dueDate: null },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return todos.map((t) => ({
    id: t.id,
    content: t.content,
    done: t.done,
    createdAt: t.createdAt,
    doneAt: t.doneAt,
    dueDate: t.dueDate,
  }));
}