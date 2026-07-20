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
    <section className="relative overflow-hidden border-t border-white/5 px-6 py-28 text-center sm:py-36">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_100%,var(--color-indigo-deep)_0%,var(--color-ink-deep)_65%)]"
      >
        <div className="animate-drift absolute bottom-0 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 translate-y-1/3 rounded-full bg-blurple/20 blur-[130px]" />
      </div>

      <h2 className="mx-auto max-w-3xl text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">
        Your server is already full of developers.
        <br className="hidden sm:block" />{" "}
        <span className="bg-gradient-to-r from-blurple to-grape bg-clip-text text-transparent">
          Give them a scoreboard.
        </span>
      </h2>

      <p className="mx-auto mt-6 max-w-lg text-pretty leading-relaxed text-mist">
        Free to add, takes about a minute to set up, and everything personal
        stays private to the person who typed it.
      </p>

      <div className="mt-10 flex justify-center">
        <DiscordButton size="lg" />
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
          <span className="font-semibold">
            Cult<span className="text-grape">Bot</span>
          </span>
        </div>

        <nav className="flex items-center gap-6 text-sm text-mist">
          <a
            href={GITHUB_URL ?? "#"}
            className="transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blurple"
          >
            GitHub
          </a>
          <a
            href="#commands"
            className="transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blurple"
          >
            Commands
          </a>
        </nav>

        {/* Replace YOUR_NAME — intentionally left as a placeholder. */}
        <p className="text-sm text-dim">
          Built by <span className="font-mono text-mist">YOUR_NAME</span>
        </p>
      </div>
    </footer>
  );
}
