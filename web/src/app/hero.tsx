"use client";

import gsap from "gsap";

import { LevelMockup } from "./discord";
import { DiscordButton, GhostLink, useGsap } from "./motion";

const COMMANDS = ["/todo", "/focus", "/streak", "/level", "/board"];

export default function Hero() {
  const root = useGsap<HTMLElement>((el) => {
    gsap.from("[data-reveal]", {
      opacity: 0,
      y: 14,
      duration: 0.5,
      stagger: 0.07,
      ease: "power2.out",
      clearProps: "all",
    });

    // The embed drifts slightly slower than the page as you scroll away —
    // enough parallax to feel dimensional, not enough to notice as an effect.
    const art = el.querySelector("[data-parallax]");
    if (art) {
      gsap.to(art, {
        y: -60,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "bottom top",
          scrub: 0.6,
        },
      });
    }
  });

  return (
    <section
      ref={root}
      className="relative overflow-hidden border-b border-white/5 px-6 pb-20 pt-16 sm:pt-20 lg:pb-28"
    >
      {/* Off-centre glow, weighted toward the copy rather than the middle. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-drift absolute -left-40 top-0 h-[36rem] w-[36rem] rounded-full bg-indigo-deep opacity-70 blur-[130px]" />
        <div className="absolute left-1/4 top-10 h-72 w-72 rounded-full bg-gold/[0.07] blur-[120px]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-12 lg:gap-10">
        {/* Copy — 7 of 12 columns, left-aligned. */}
        <div className="lg:col-span-7">
          <div
            data-reveal
            className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.18em] text-dim"
          >
            <span className="size-1.5 rounded-full bg-gold" />
            Developer productivity, gamified
          </div>

          <h1
            data-reveal
            className="mt-5 max-w-[15ch] font-display text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-[4.25rem]"
          >
            Ship code. Earn XP. Keep the streak.
          </h1>

          <p
            data-reveal
            className="mt-7 max-w-md text-pretty leading-relaxed text-mist"
          >
            CultBot tracks your todos, goals, focus sessions and habits inside
            Discord — and turns the follow-through into streaks, XP and a
            leaderboard your server can see.
          </p>

          <div
            data-reveal
            className="mt-9 flex w-full flex-col gap-3 sm:flex-row sm:items-center"
          >
            <DiscordButton />
            <GhostLink href="#commands">View commands</GhostLink>
          </div>

          <ul
            data-reveal
            className="mt-12 flex flex-wrap gap-2 font-mono text-[13px] text-dim"
          >
            {COMMANDS.map((command, i) => (
              <li
                key={command}
                style={{ "--i": i } as React.CSSProperties}
                className="chip relative rounded-md border border-white/10 px-2.5 py-1 transition-[scale,border-color,color] duration-200 ease-out hover:scale-[1.04] hover:border-white/25 hover:text-mist"
              >
                {command}
              </li>
            ))}
          </ul>
        </div>

        {/* Art — 5 of 12, nudged off-axis so the composition isn't a clean split. */}
        <div data-reveal className="lg:col-span-5">
          <div data-parallax className="relative lg:-mr-12 lg:rotate-[1.5deg]">
            <div
              aria-hidden
              className="absolute -inset-8 -z-10 rounded-[2rem] bg-gold/[0.06] blur-3xl"
            />
            <LevelMockup animate />
          </div>
        </div>
      </div>
    </section>
  );
}
