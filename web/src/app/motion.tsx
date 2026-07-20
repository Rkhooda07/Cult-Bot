"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { INVITE_URL } from "./links";

gsap.registerPlugin(ScrollTrigger);

/** The reduced-motion gate established in the hero (Block 1). */
const MOTION_OK = "(prefers-reduced-motion: no-preference)";

/**
 * A real cursor as well — touch has nothing to be magnetic toward, and a
 * pointer-driven effect on a tap leaves the element stuck in its hover state.
 */
const CURSOR_OK = `${MOTION_OK} and (hover: hover) and (pointer: fine)`;

/**
 * Every animation on the site goes through here. gsap.matchMedia means the
 * tweens are never *created* when the query fails, so reduced-motion users get
 * the final state as authored — nothing to skip, reset or fast-forward.
 *
 * `setup` may return a cleanup function; gsap runs it on revert.
 */
export function useGsap<T extends HTMLElement>(
  setup: (el: T) => (() => void) | void,
  query: string = MOTION_OK,
) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mm = gsap.matchMedia(el);
    mm.add(query, () => setup(el));
    return () => mm.revert();
    // Setup is defined inline at each call site; re-running on identity change
    // would rebuild every ScrollTrigger on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}

/**
 * Fades its direct children up as the group enters the viewport, staggered.
 *
 * Deliberately animates children rather than itself so a row of cards arrives
 * in sequence. Only opacity and y (a transform) are touched — no layout
 * properties, so this stays off the main thread during scroll.
 *
 * Note this uses gsap.from, so the server-rendered HTML is fully visible and
 * only becomes transparent after hydration — crawlers and no-JS readers see
 * the complete page.
 */
export function Reveal({
  children,
  className,
  stagger = 0.08,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  const ref = useGsap<HTMLDivElement>((el) => {
    gsap.from(Array.from(el.children), {
      opacity: 0,
      y: 24,
      duration: 0.5,
      ease: "power2.out",
      stagger,
      // Hand the properties back to CSS when the reveal finishes. Without
      // this, GSAP's inline transform outranks the cards' hover:-translate-y
      // class and the lift silently never fires.
      clearProps: "all",
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
    });
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * The page's primary CTA. Drifts toward the cursor on hover — quickTo writes
 * to gsap's x/y, which compile to a transform, never to left/top.
 */
export function DiscordButton({
  size = "md",
  children = "Add to Discord",
}: {
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}) {
  const ref = useGsap<HTMLAnchorElement>((el) => {
    const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });

    // GSAP owns this element's transform outright, scale included. A CSS
    // hover:scale class would be silently overridden by the inline transform
    // these tweens write, so keeping both in one system is the only way the
    // lift actually fires.
    const onEnter = () => gsap.to(el, { scale: 1.02, duration: 0.2, ease: "power2.out" });
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.25);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
    };
    const onLeave = () => {
      xTo(0);
      yTo(0);
      gsap.to(el, { scale: 1, duration: 0.2, ease: "power2.out" });
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, CURSOR_OK);

  return (
    <a
      ref={ref}
      href={INVITE_URL ?? "#"}
      className={`group relative inline-flex w-full items-center justify-center rounded-lg bg-gold font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold sm:w-auto ${
        size === "lg"
          ? "min-h-14 px-9 text-lg"
          : size === "sm"
            ? "min-h-9 px-4 text-[13px]"
            : "min-h-11 px-6 text-[15px]"
      }`}
    >
      {/* Solid gold, no gradient. The only motion is scale + a glow that
          fades in — both GPU-composited. */}
      <span
        aria-hidden
        className="absolute -inset-3 -z-10 rounded-2xl bg-gold opacity-0 blur-2xl transition-opacity duration-200 ease-out group-hover:opacity-25"
      />
      {children}
    </a>
  );
}

/** Ghost secondary. Deliberately quiet so the gold button owns the hierarchy. */
export function GhostLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-white/10 px-6 text-[15px] font-medium text-mist transition-[scale,border-color,color] duration-200 ease-out hover:scale-[1.02] hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold sm:w-auto"
    >
      {children}
    </a>
  );
}
