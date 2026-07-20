import { BroadcastMockup, LevelMockup, TodoMockup } from "./discord";
import { Reveal } from "./motion";

/* Stroke icons rather than emoji — the emoji in the mockups are real bot
   output, but the page chrome shouldn't lean on them as an icon set. */
const icon = "size-5 stroke-[1.75]";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={icon}>
      <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={icon}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" strokeLinecap="round" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={icon}>
      <path
        d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 20h6M12 14v6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={icon}>
      <path
        d="M8 6l-5 6 5 6M16 6l5 6-5 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={icon}>
      <circle cx="9" cy="8" r="3.5" />
      <path
        d="M2.5 20a6.5 6.5 0 0113 0M16 5.2a3.5 3.5 0 010 5.6M18.5 20a6.5 6.5 0 00-3-5.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Category = {
  title: string;
  blurb: string;
  commands: string[];
  Icon: () => React.ReactElement;
  tint: string;
};

const PERSONAL: Category = {
  title: "Personal Productivity",
  blurb:
    "Todos, goals, habits and reminders — each one a private panel you drive with buttons and modals instead of memorising sub-commands.",
  commands: ["/todo", "/goal", "/habit", "/remind add"],
  Icon: CheckIcon,
  tint: "text-blurple",
};

const INTEGRATIONS: Category = {
  title: "Developer Integrations",
  blurb:
    "Link GitHub, LeetCode and Codeforces once, and real work becomes XP automatically. GitHub also detects private-repo activity and renders your contribution graph.",
  commands: ["/link github", "/link leetcode", "/dev-stats"],
  Icon: CodeIcon,
  tint: "text-lime",
};

const ACHIEVEMENTS: Category = {
  title: "XP & Achievements",
  blurb:
    "Every completed todo, finished focus session and shipped commit awards XP. Levels climb, badges unlock as you hit milestones.",
  commands: ["/level", "/badges"],
  Icon: TrophyIcon,
  tint: "text-gold",
};

const GRID: Category[] = [
  {
    title: "Focus & Growth",
    blurb:
      "Pomodoro sessions you start and stop in-channel, daily streaks that survive as long as you do, and a Productivity Score across everything you track.",
    commands: ["/focus start", "/streak", "/stats"],
    Icon: TimerIcon,
    tint: "text-ember",
  },
  {
    title: "Community",
    blurb:
      "The social half: a shared team board, a guild XP leaderboard, and admin-created challenges your server takes on together.",
    commands: ["/board", "/leaderboard", "/challenge create"],
    Icon: UsersIcon,
    tint: "text-grape",
  },
];

function Commands({ commands }: { commands: string[] }) {
  return (
    <ul className="mt-5 flex flex-wrap gap-2">
      {commands.map((c) => (
        <li
          key={c}
          className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[13px] text-mist"
        >
          {c}
        </li>
      ))}
    </ul>
  );
}

function Heading({ title, blurb, commands, Icon, tint }: Category) {
  return (
    <div>
      <div className={`inline-flex rounded-lg bg-white/[0.06] p-2.5 ${tint}`}>
        <Icon />
      </div>
      <h3 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h3>
      <p className="mt-3 max-w-lg text-pretty leading-relaxed text-mist">
        {blurb}
      </p>
      <Commands commands={commands} />
    </div>
  );
}

function Card({ title, blurb, commands, Icon, tint }: Category) {
  return (
    <div className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition-transform duration-300 hover:-translate-y-1">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 ring-1 ring-blurple/50 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className={`inline-flex rounded-lg bg-white/[0.06] p-2.5 ${tint}`}>
        <Icon />
      </div>
      <h3 className="mt-4 text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-mist">
        {blurb}
      </p>
      <Commands commands={commands} />
    </div>
  );
}

/** Text and mockup side by side; `flip` puts the mockup first on desktop. */
function Spotlight({
  category,
  children,
  flip = false,
}: {
  category: Category;
  children: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <Reveal className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16" stagger={0.12}>
      <div className={flip ? "lg:order-2" : ""}>
        <Heading {...category} />
      </div>
      <div className={flip ? "lg:order-1" : ""}>{children}</div>
    </Reveal>
  );
}

export default function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="max-w-2xl">
        <p className="font-mono text-sm text-blurple">{"// what it does"}</p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
          Everything you already do, finally counted.
        </h2>
      </div>

      <div className="mt-20 space-y-24 sm:mt-24">
        <Spotlight category={PERSONAL}>
          <TodoMockup />
        </Spotlight>

        <Spotlight category={INTEGRATIONS} flip>
          <BroadcastMockup />
        </Spotlight>

        <Spotlight category={ACHIEVEMENTS}>
          <LevelMockup />
        </Spotlight>

        <Reveal className="grid gap-6 md:grid-cols-2">
          {GRID.map((c) => (
            <Card key={c.title} {...c} />
          ))}
        </Reveal>
      </div>
    </section>
  );
}
