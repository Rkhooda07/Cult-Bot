import { GITHUB_URL } from "./links";
import { DiscordButton } from "./motion";

/** The bracket mark — one of only two places the blurple/grape gradient lives. */
function Mark() {
  return (
    <svg
      viewBox="0 0 512 512"
      role="img"
      aria-label="CultBot"
      className="size-7 shrink-0"
    >
      <defs>
        <linearGradient id="nav-bracket" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5865F2" />
          <stop offset="100%" stopColor="#9B59B6" />
        </linearGradient>
      </defs>
      <g fill="none" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 200 140 L 108 256 L 200 372" stroke="url(#nav-bracket)" />
        <path d="M 312 140 L 404 256 L 312 372" stroke="url(#nav-bracket)" />
        <path d="M 224 262 L 248 290 L 294 222" stroke="#F1C40F" strokeWidth="30" />
      </g>
    </svg>
  );
}

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#commands", label: "Commands" },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <a
          href="#top"
          className="flex items-center gap-2.5 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
        >
          <Mark />
          <span className="font-display font-semibold tracking-tight">
            CultBot
          </span>
        </a>

        <div className="flex items-center gap-6 sm:gap-8">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="nav-link relative py-1 text-sm text-mist transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              {link.label}
            </a>
          ))}

          <a
            href={GITHUB_URL ?? "#"}
            className="nav-link relative hidden py-1 text-sm text-mist transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold sm:inline-block"
          >
            GitHub
          </a>

          {/* The nav CTA is desktop-only — on mobile the hero's own button is
              a few hundred pixels away and two would just crowd the bar. */}
          <div className="hidden lg:block">
            <DiscordButton size="sm">Add to Discord</DiscordButton>
          </div>
        </div>
      </nav>
    </header>
  );
}
