"use client";

import { useEffect, useRef, useState } from "react";

// "By the numbers": the network's size, counting up once the section scrolls
// into view (staging's animation). The counts come from the server, cached
// (getNetworkCounts); a capped count shows "+".

export type StatItem = { key: string; label: string; value: number | null; capped: boolean };

export default function NetworkStatsView({ items }: { items: StatItem[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="network-stats"
      className="lp-section lp-stats"
      aria-labelledby="lp-stats-title"
    >
      <div className="lp-section__inner">
        <header className="lp-section__header">
          <span className="lp-eyebrow">By the numbers</span>
          <h2 id="lp-stats-title" className="lp-h2">
            A network you can build on
          </h2>
        </header>
        {/* No aria-live: the count-up changes the text every frame. */}
        <ul className="lp-stats__row">
          {items.map((item, index) => (
            <li key={item.key} className="lp-stats__cell">
              <span className="lp-stats__value" data-loading={!inView || item.value === null}>
                <AnimatedCount value={inView ? item.value : null} delayMs={index * STAGGER_MS} />
                {item.capped && inView && item.value !== null && "+"}
              </span>
              <span className="lp-stats__label">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FORMATTER = new Intl.NumberFormat("en-US");
const COUNT_UP_MS = 1400;
const STAGGER_MS = 110;

function AnimatedCount({ value, delayMs }: { value: number | null; delayMs: number }) {
  const display = useCountUp(value, delayMs);
  if (value === null || display === null) return <>—</>;
  return <>{FORMATTER.format(display)}</>;
}

// Equal duration regardless of magnitude so cells with very
// different targets land at the same moment. Subsequent updates
// (5-min cache refresh) animate from the last displayed value, not
// from 0, so a small delta doesn't whip back through the full range.
function useCountUp(target: number | null, delayMs: number): number | null {
  const [display, setDisplay] = useState<number | null>(null);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === null) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Intentional setState in effect (TECH-814): rAF count-up animation driver; the sync setDisplay writes the terminal value for the prefers-reduced-motion and zero-delta cases — the effect IS the animation's external-system sync
      setDisplay(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) {
      setDisplay(target);
      return;
    }

    let startedAt: number | null = null;
    timeoutRef.current = window.setTimeout(() => {
      const tick = (now: number) => {
        if (startedAt === null) startedAt = now;
        const t = Math.min(1, (now - startedAt) / COUNT_UP_MS);
        const eased = 1 - (1 - t) ** 3;
        setDisplay(Math.round(from + delta * eased));
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          fromRef.current = target;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, delayMs]);

  return display;
}
