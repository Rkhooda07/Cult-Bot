"use client";

import gsap from "gsap";

import { DiscordButton, useGsap } from "./motion";

/** The logo mark, transparent — the files in public/ bake in an opaque background. */
function Wordmark() {
  return (
    <div className="flex items-center justify-center gap-4 sm:gap-5">
      <svg
        viewBox="0 0 512 512"
        role="img"
        aria-label="CultBot logo"
        className="h-14 w-14 shrink-0 sm:h-20 sm:w-20"
      >
        <defs>
          <linearGradient id="bracket" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5865F2" />
            <stop offset="100%" stopColor="#9B59B6" />
          </linearGradient>
        </defs>
        <g
          fill="none"
          strokeWidth="34"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 200 140 L 108 256 L 200 372" stroke="url(#bracket)" />
          <path d="M 312 140 L 404 256 L 312 372" stroke="url(#bracket)" />
          <path
            d="M 224 262 L 248 290 L 294 222"
            stroke="#F1C40F"
            strokeWidth="30"
          />
        </g>
      </svg>
      <span className="text-4xl font-extrabold tracking-tight sm:text-6xl">
        Cult<span className="text-grape">Bot</span>
      </span>
    </div>
  );
}

const COMMANDS = ["/todo", "/focus", "/streak", "/level", "/board"];

export default function Hero() {
  // Same reduced-motion gate as every other animation on the page. On load
  // rather than on scroll, so no ScrollTrigger here.
  const root = useGsap<HTMLElement>(() => {
    gsap.from("[data-reveal]", {
      opacity: 0,
      y: 16,
      duration: 0.5,
      stagger: 0.08,
      ease: "power2.out",
      clearProps: "all",
    });
  });

  return (
    <section
      ref={root}
      className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
    >
      {/* Background: base gradient + two drifting accent glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,var(--color-indigo-deep)_0%,var(--color-ink)_60%)]"
      >
        <div className="animate-drift absolute left-1/2 top-1/4 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-blurple/20 blur-[120px]" />
        <div className="animate-drift absolute left-1/2 top-1/3 h-[26rem] w-[26rem] -translate-x-1/3 rounded-full bg-grape/15 blur-[110px] [animation-duration:22s] [animation-direction:alternate-reverse]" />
      </div>

      <div data-reveal>
        <Wordmark />
      </div>

      <h1
        data-reveal
        className="mt-10 max-w-3xl text-balance text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl"
      >
        Ship code. Earn XP.{" "}
        <span className="bg-gradient-to-r from-blurple to-grape bg-clip-text text-transparent">
          Keep the streak.
        </span>
      </h1>

      <p
        data-reveal
        className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-mist"
      >
        CultBot tracks your todos, goals, focus sessions and habits inside
        Discord — and turns the follow-through into streaks, XP and a
        leaderboard your server can see.
      </p>

      <div
        data-reveal
        className="mt-10 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row"
      >
        <DiscordButton />
        <a
          href="#commands"
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-8 font-semibold text-mist transition hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blurple sm:w-auto"
        >
          View Commands
        </a>
      </div>

      <ul
        data-reveal
        className="mt-12 flex flex-wrap items-center justify-center gap-2 font-mono text-sm text-dim"
      >
        {COMMANDS.map((command) => (
          <li
            key={command}
            className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5"
          >
            {command}
          </li>
        ))}
      </ul>
    </section>
  );
}
