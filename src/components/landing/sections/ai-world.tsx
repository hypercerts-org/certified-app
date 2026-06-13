"use client";

import { useEffect, useRef } from "react";

/**
 * "Built for an AI world" — the AI positioning section. Two statements:
 * (1) when everyone can produce a perfect narrative, presentation stops
 * being a reliable signal and judgement shifts to a verifiable track
 * record, and (2) that same open, machine-readable record is what AI
 * agents read to discover, match, and vouch. Reuses the numbered
 * lp-item pattern; two-column grid that stacks below 800px.
 *
 * Reveal: an IntersectionObserver arms the columns (hides them) on mount
 * and releases them when the section scrolls into view, so the two
 * statements fade up left-then-right. Markup is visible by default, so
 * without JS the content still renders; reduced-motion skips straight to
 * the shown state with no transition.
 */

const STATEMENTS = [
  {
    num: "01",
    title: "When every project sounds impressive",
    body: "With AI, anyone can produce a compelling pitch, so presentation says little about whether a project is good. Judgement shifts to what can't be performed: funding you genuinely raised, work you published, endorsements signed by partners who put their name to it. Evidence, not eloquence.",
  },
  {
    num: "02",
    title: "The trust layer agents read",
    body: "Records are open and machine-readable on AT Protocol. As AI agents start discovering projects, matching funders, and vouching on people's behalf, your signed record is what they read. When people and AI decide together, that transparency is what keeps the outcomes sound.",
  },
];

export default function AiWorld() {
  const ref = useRef<HTMLDivElement>(null);

  // The reveal is driven through the ref's data-anim attribute rather
  // than React state: no extra render, and no content is hidden until
  // JS runs (the markup ships visible, so no-JS / reduced-motion render
  // the finished state). armed = hidden + ready; shown = released.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    el.dataset.anim = "armed";
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.anim = "shown";
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="lp-section" aria-labelledby="lp-ai-title">
      <div className="lp-section__inner">
        <header className="lp-section__header">
          <span className="lp-eyebrow">Built for an AI world</span>
          <h2 id="lp-ai-title" className="lp-h2">
            When anything can be generated, real is the rare thing
          </h2>
          <p className="lp-ai__lede">
            Certified doesn&apos;t generate trust. It records it. A verified,
            endorsed history that both people and machines can rely on.
          </p>
        </header>
        <div className="lp-ai" ref={ref}>
          {STATEMENTS.map((s) => (
            <div key={s.num} className="lp-ai__col lp-item">
              <span className="lp-item__num">{s.num}</span>
              <h3 className="lp-item__title">{s.title}</h3>
              <p className="lp-item__body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
