import { prisma } from "../database/prisma";

export interface ChallengeWithParticipants {
  id: string;
  guildId: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  participants: Array<{
    id: string;
    userId: string;
    completed: boolean;
    joinedAt: Date;
  }>;
}

export async function createChallenge(
  guildId: string,
  title: string,
  description: string,
  endsAt: Date
): Promise<ChallengeWithParticipants> {
  const challenge = await prisma.communityChallenge.create({
    data: {
      guildId,
      title,
      description,
      startsAt: new Date(),
      endsAt,
    },
    include: { participants: true },
  });

  return {
    id: challenge.id,
    guildId: challenge.guildId,
    title: challenge.title,
    description: challenge.description,
    startsAt: challenge.startsAt,
    endsAt: challenge.endsAt,
    participants: challenge.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      completed: p.completed,
      joinedAt: p.joinedAt,
    })),
  };
}

export async function getChallenge(challengeId: string): Promise<ChallengeWithParticipants | null> {
  const challenge = await prisma.communityChallenge.findUnique({
    where: { id: challengeId },
    include: { participants: true },
  });

  if (!challenge) return null;

  return {
    id: challenge.id,
    guildId: challenge.guildId,
    title: challenge.title,
    description: challenge.description,
    startsAt: challenge.startsAt,
    endsAt: challenge.endsAt,
    participants: challenge.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      completed: p.completed,
      joinedAt: p.joinedAt,
    })),
  };
}

export async function getActiveChallenges(guildId: string): Promise<ChallengeWithParticipants[]> {
  const challenges = await prisma.communityChallenge.findMany({
    where: {
      guildId,
      endsAt: { gte: new Date() },
    },
    include: { participants: true },
    orderBy: { endsAt: "asc" },
  });

  return challenges.map((c) => ({
    id: c.id,
    guildId: c.guildId,
    title: c.title,
    description: c.description,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    participants: c.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      completed: p.completed,
      joinedAt: p.joinedAt,
    })),
  }));
}

export async function joinChallenge(challengeId: string, userId: string): Promise<boolean> {
  const existing = await prisma.challengeParticipant.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
  });
  if (existing) return false;

  await prisma.challengeParticipant.create({
    data: { challengeId, userId },
  });
  return true;
}

export async function completeChallenge(challengeId: string, userId: string): Promise<boolean> {
  const participant = await prisma.challengeParticipant.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
  });
  if (!participant) return false;
  if (participant.completed) return false;

  await prisma.challengeParticipant.update({
    where: { challengeId_userId: { challengeId, userId } },
    data: { completed: true },
  });
  return true;
}

export async function getUserChallengeStatus(
  challengeId: string,
  userId: string
): Promise<{ joined: boolean; completed: boolean }> {
  const participant = await prisma.challengeParticipant.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
  });

  if (!participant) return { joined: false, completed: false };
  return { joined: true, completed: participant.completed };
}