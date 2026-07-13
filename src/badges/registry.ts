export interface UserStats {
  goalsCompleted: number;
  bestStreak: number;
  tasksCompleted: number;
}

export interface BadgeRule {
  key: string;
  name: string;
  icon: string;
  check: (stats: UserStats) => boolean;
}

export const badgeRegistry: BadgeRule[] = [
  {
    key: "first_project",
    name: "First Project",
    icon: "🏆",
    check: (s) => s.goalsCompleted >= 1,
  },
  {
    key: "streak_30",
    name: "30 Day Streak",
    icon: "🔥",
    check: (s) => s.bestStreak >= 30,
  },
  {
    key: "tasks_100",
    name: "100 Tasks",
    icon: "⚡",
    check: (s) => s.tasksCompleted >= 100,
  },
  {
    key: "ship_master",
    name: "Ship Master",
    icon: "🚀",
    check: (s) => s.goalsCompleted >= 10,
  },
];
