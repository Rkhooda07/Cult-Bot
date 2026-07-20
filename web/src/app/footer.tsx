import { GITHUB_URL } from "./links";
import { DiscordButton } from "./motion";

/** The bracket mark, transparent — same inline treatment as the hero. */
function Mark({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      role="img"
      aria-label="CultBot logo"
      className={className}
    >
      <defs>
        <linearGradient id="footer-bracket" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5865F2" />
          <stop offset="100%" stopColor="#9B59B6" />
        </linearGradient>
      </defs>
      <g fill="none" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 200 140 L 108 256 L 200 372" stroke="url(#footer-bracket)" />
        <path d="M 312 140 L 404 256 L 312 372" stroke="url(#footer-bracket)" />
        <path d="M 224 262 L 248 290 L 294 222" stroke="#F1C40F" strokeWidth="30" />
      </g>
    </svg>
  );
}

export function Cta() {
  return (
    <section className="relative overflow-hidden border-t border-white/5 px-6 py-28 sm:py-36">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_20%_100%,var(--color-indigo-deep)_0%,var(--color-ink-deep)_60%)]"
      >
        <div className="animate-drift absolute bottom-0 left-[15%] h-[28rem] w-[28rem] translate-y-1/3 rounded-full bg-gold/[0.06] blur-[130px]" />
      </div>

      {/* Copy left, action right — the closing beat mirrors the hero's
          asymmetry instead of recentring everything. */}
      <div className="mx-auto flex max-w-6xl flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="max-w-[18ch] font-display text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
            Your server is already full of developers.
          </h2>
          <p className="mt-6 max-w-md text-pretty leading-relaxed text-mist">
            Free to add, about a minute to set up, and everything personal stays
            private to the person who typed it.
          </p>
        </div>

        <div className="shrink-0">
          <DiscordButton size="lg" />
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-ink-deep px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Mark className="size-7" />
          <span className="font-display font-semibold tracking-tight">CultBot</span>
        </div>

        <nav className="flex items-center gap-6 text-sm text-mist">
          <a
            href={GITHUB_URL ?? "#"}
            className="transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
          >
            GitHub
          </a>
          <a
            href="#commands"
            className="transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
          >
            Commands
          </a>
        </nav>

        <p className="text-sm text-dim">
          Built by <span className="text-mist">Rakshit</span>
        </p>
      </div>
    </footer>
  );
}
