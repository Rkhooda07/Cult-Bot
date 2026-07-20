/**
 * Recreations of the bot's actual embeds, not generic cards.
 *
 * Every title, color, field label and footer below is lifted from source:
 * src/utils/embedFactory.ts (COLORS), src/embeds/todoEmbed.ts,
 * src/commands/level/level.ts and src/services/broadcastService.ts.
 * If an embed changes in the bot, it should change here too.
 */

/** The bot's progressBar() from src/utils/progressBar.ts, character for character. */
function bar(percent: number, length = 10) {
  const filled = Math.round((percent / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

/**
 * Reusable block-character progress bar. The bot renders these as inline code
 * inside an embed, so this matches that rather than drawing a styled div.
 */
export function ProgressBar({
  percent,
  length = 10,
  className = "text-blurple",
}: {
  percent: number;
  length?: number;
  className?: string;
}) {
  return (
    <code
      className={`rounded bg-discord-code px-1.5 py-0.5 font-mono text-[13px] tracking-tighter ${className}`}
      aria-label={`${percent}% complete`}
    >
      {bar(percent, length)}
    </code>
  );
}

/**
 * Emoji sit flush against the following word when written inline, so they get
 * their own box. The bot's strings really do lead with these emoji.
 */
function Emoji({ children }: { children: string }) {
  return (
    <span aria-hidden className="mr-1.5 inline-block">
      {children}
    </span>
  );
}

/** setThumbnail() is the user's avatar — Discord renders it as a rounded square. */
function Thumb() {
  return (
    <div
      aria-hidden
      className="hidden size-16 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blurple to-grape text-lg font-semibold text-white sm:grid"
    >
      RK
    </div>
  );
}

const BOT_AVATAR = (
  <div
    aria-hidden
    className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blurple to-grape text-sm font-semibold text-white"
  >
    N
  </div>
);

/**
 * Discord's message chrome: avatar, author line, BOT tag, then the embed.
 * `buttons` renders *outside* the embed — Discord attaches action rows to the
 * message, not the embed, so they sit below the colored border, not inside it.
 */
function Message({
  author,
  accent,
  children,
  buttons,
}: {
  author: string;
  accent: string;
  children: React.ReactNode;
  buttons?: React.ReactNode;
}) {
  return (
    <div className="w-full rounded-lg bg-discord-chat p-4 shadow-xl shadow-black/40 ring-1 ring-white/5">
      <div className="flex gap-3">
        {BOT_AVATAR}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-white">{author}</span>
            <span className="rounded bg-blurple px-1 py-px text-[10px] font-semibold uppercase leading-tight text-white">
              Bot
            </span>
            <span className="text-xs text-discord-muted">Today at 09:41</span>
          </div>
          {/* The colored strip is the embed's domain color from COLORS. */}
          <div
            className="mt-1 overflow-hidden rounded border-l-4 bg-discord-embed"
            style={{ borderColor: accent }}
          >
            <div className="p-4">{children}</div>
          </div>
          {buttons}
        </div>
      </div>
    </div>
  );
}

function Footer({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-discord-muted">
      <span
        aria-hidden
        className="grid size-4 place-items-center rounded-full bg-gradient-to-br from-blurple to-grape text-[8px] font-bold"
      >
        N
      </span>
      {text}
    </div>
  );
}

/** Discord's button row. Colors are Discord's ButtonStyle values. */
function Buttons({
  items,
}: {
  items: { label: string; emoji: string; style: string; disabled?: boolean }[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((b) => (
        <span
          key={b.label}
          className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1.5 text-[13px] font-medium text-white ${
            b.style
          } ${b.disabled ? "opacity-50" : ""}`}
        >
          <span aria-hidden>{b.emoji}</span>
          {b.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** src/embeds/todoEmbed.ts — COLORS.todo (#5865F2). */
export function TodoMockup() {
  const todos = [
    { text: "Fix the reminder timezone bug", done: true },
    { text: "Ship the contribution graph renderer", done: true },
    { text: "Write the weekly recap cron", done: false },
    { text: "Review the board PR", done: false },
  ];

  return (
    <Message
      accent="#5865F2"
      author="NerdCult"
      buttons={
        <Buttons
          items={[
            { emoji: "➕", label: "Add", style: "bg-discord-green" },
            { emoji: "✔", label: "Complete", style: "bg-blurple" },
            { emoji: "✏️", label: "Edit", style: "bg-discord-btn" },
            { emoji: "🗑️", label: "Delete", style: "bg-[#da373c]" },
          ]}
        />
      }
    >
      <h3 className="font-semibold text-white">
        <Emoji>📝</Emoji>rk_hooda&apos;s Checklist
      </h3>
      <ul className="mt-2 space-y-1 text-sm text-discord-text">
        {todos.map((t) => (
          <li key={t.text} className="flex gap-2">
            <span aria-hidden className={t.done ? "text-lime" : ""}>
              {t.done ? "✔" : "☐"}
            </span>
            <span className={t.done ? "text-discord-muted line-through" : ""}>
              {t.text}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <div className="text-sm font-semibold text-white">Progress</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-discord-text">
          <ProgressBar percent={50} />
          <span>50% (2/4)</span>
        </div>
      </div>

      <Footer text="NerdCult" />
    </Message>
  );
}

/** src/cron/githubPoller.ts + broadcastService.ts — COLORS.xp (#F1C40F). */
export function BroadcastMockup() {
  return (
    <Message accent="#F1C40F" author="NerdCult">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">
            <Emoji>🚀</Emoji>New Commit Shipped!
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-discord-text">
            <strong className="font-semibold text-white">rk_hooda</strong> pushed
            3 commits to{" "}
            <code className="rounded bg-discord-code px-1.5 py-0.5 font-mono text-[13px]">
              nerdcult
            </code>{" "}
            — <strong className="font-semibold text-gold">+15 XP</strong>
          </p>
          <div className="mt-4">
            <div className="text-sm font-semibold text-white">
              <Emoji>🔥</Emoji>Current Streak
            </div>
            <div className="text-sm text-discord-text">12 days</div>
          </div>
        </div>
        <Thumb />
      </div>
      <Footer text="NerdCult" />
    </Message>
  );
}

/** src/commands/level/level.ts — COLORS.xp (#F1C40F), 15-char bar. */
export function LevelMockup() {
  return (
    <Message accent="#F1C40F" author="NerdCult">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">
            <Emoji>🏆</Emoji>Level &amp; XP Progress
          </h3>
          <div className="mt-2 space-y-2 text-sm text-discord-text">
            <p className="text-base font-bold text-white">Level 7</p>
            <p>
              Progress to Level 8:{" "}
              <strong className="font-semibold text-white">420</strong> /{" "}
              <strong className="font-semibold text-white">500 XP</strong>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ProgressBar percent={84} length={15} className="text-gold" />
              <span>(84%)</span>
            </div>
            <p>
              Total XP:{" "}
              <strong className="font-semibold text-white">3,420 XP</strong>
            </p>
          </div>
        </div>
        <Thumb />
      </div>
      <Footer text="NerdCult • rk_hooda" />
    </Message>
  );
}
