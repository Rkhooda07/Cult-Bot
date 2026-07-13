import { PrismaClient } from "@prisma/client";

// Badges from Section 8 of the spec — starter set.
// badgeService.evaluate() checks these rules after every XP-awarding event.
const STARTER_BADGES = [
  {
    key: "first_project",
    name: "First Project",
    description: "Complete your first goal.",
    icon: "🏆",
  },
  {
    key: "streak_30",
    name: "30 Day Streak",
    description: "Maintain a 30-day activity streak.",
    icon: "🔥",
  },
  {
    key: "tasks_100",
    name: "100 Tasks",
    description: "Complete 100 todos.",
    icon: "⚡",
  },
  {
    key: "ship_master",
    name: "Ship Master",
    description: "Complete 10 goals.",
    icon: "🚀",
  },
];

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("Seeding badges…");

    for (const badge of STARTER_BADGES) {
      await prisma.badge.upsert({
        where: { key: badge.key },
        update: {
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
        },
        create: badge,
      });
      console.log(`  ✓ ${badge.icon}  ${badge.name} (${badge.key})`);
    }

    const count = await prisma.badge.count();
    console.log(`\nDone — ${count} badge(s) in the database.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
