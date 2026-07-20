import { Reveal } from "./motion";

/**
 * Descriptions are the bot's real setDescription() strings — see
 * src/commands/<name>/. Keep them in sync when a command's description changes.
 */
const GROUPS: { title: string; commands: [string, string][] }[] = [
  {
    title: "Personal Productivity",
    commands: [
      ["/todo", "Open your personal todo panel"],
      ["/goal", "Open your personal goal panel"],
      ["/habit", "Open your personal habit panel"],
      ["/remind", "Set a reminder or list upcoming reminders"],
      ["/today", "Today's overview: open todos, reminders and goal progress"],
    ],
  },
  {
    title: "Focus & Growth",
    commands: [
      ["/focus", "Start or stop a Pomodoro focus session"],
      ["/streak", "View your current and best productivity streaks"],
      ["/stats", "View your overall productivity stats and Productivity Score"],
    ],
  },
  {
    title: "XP & Achievements",
    commands: [
      ["/level", "View your current level and XP progress bar"],
      ["/badges", "View your earned and locked productivity badges"],
    ],
  },
  {
    title: "Developer Integrations",
    commands: [
      ["/link github", "Link GitHub — new commits award XP automatically"],
      ["/link leetcode", "Link LeetCode — new solves award XP automatically"],
      ["/link codeforces", "Link Codeforces — new solves award XP automatically"],
      ["/dev-stats", "Your combined dev activity today across all three"],
    ],
  },
  {
    title: "Community",
    commands: [
      ["/board", "View the server todo completion board (shared public view)"],
      ["/leaderboard", "View the guild leaderboard (top 10 by XP)"],
      ["/challenge", "Create, join and complete community challenges"],
    ],
  },
  {
    title: "Settings",
    commands: [["/settings", "Manage your timezone and privacy settings"]],
  },
];

export default function Commands() {
  return (
    <section
      id="commands"
      className="scroll-mt-16 border-t border-white/5 bg-ink-deep"
    >
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-dim">{"// commands"}</p>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">
            Eighteen commands. No manual.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-mist">
            Each one opens a panel you drive with buttons, select menus and
            modals — so this is the whole surface area you ever need to type.
          </p>
        </div>

        <Reveal className="mt-16 grid gap-x-12 gap-y-12 md:grid-cols-2" stagger={0.06}>
          {GROUPS.map((group) => (
            <div key={group.title} className="min-w-0">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                {group.title}
              </h3>
              <dl className="mt-4 divide-y divide-white/5 border-t border-white/5">
                {group.commands.map(([name, description]) => (
                  <div
                    key={name}
                    className="cmd-row flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                  >
                    <dt className="shrink-0 font-mono text-sm text-white sm:w-40">
                      {name}
                    </dt>
                    <dd className="text-sm leading-relaxed text-mist">
                      {description}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
