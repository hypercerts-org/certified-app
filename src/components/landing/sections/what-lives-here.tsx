"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "What lives here" — the three things a Certified account holds.
 * Header in the left columns, three numbered rows divided by hairlines
 * on the right, each with a small seal-grammar glyph.
 *
 * The glyphs inscribe themselves when the rows scroll into view: arcs
 * and connector lines draw in (dash-draw over pathLength-normalized
 * paths), layers and marks fade in staggered (absolute delays baked
 * per element, cascading row by row). The global reduced-motion
 * kill-switch collapses it all to the finished state.
 */

const ITEMS = [
  {
    num: "01",
    title: "Your profile",
    body: "Who you are and what you work on, in one place. Edit it once; it updates everywhere it's used.",
    glyph: (
      // One identity: a ring with a single signature arc and a center mark.
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="0.75" opacity="0.28" className="lp-glyph-fade" />
        <path
          d="M 32 10 A 22 22 0 0 1 51 21"
          pathLength={100}
          stroke="currentColor"
          strokeWidth="1.25"
          opacity="0.9"
          strokeLinecap="round"
          className="lp-glyph-draw"
          style={{ animationDelay: "250ms" }}
        />
        <circle cx="32" cy="32" r="3" fill="currentColor" opacity="0.9" className="lp-glyph-fade" style={{ animationDelay: "650ms" }} />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Your record",
    body: "The projects you've run, the funding you've received, the work you've published. It stays yours and moves with you, whichever apps come and go.",
    glyph: (
      // A record accumulating: stacked layers, newest on top.
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <rect x="12" y="38" width="40" height="12" rx="1" stroke="currentColor" strokeWidth="0.75" opacity="0.14" className="lp-glyph-fade" style={{ animationDelay: "150ms" }} />
        <rect x="12" y="31" width="40" height="12" rx="1" stroke="currentColor" strokeWidth="0.75" opacity="0.28" className="lp-glyph-fade" style={{ animationDelay: "280ms" }} />
        <rect x="12" y="24" width="40" height="12" rx="1" stroke="currentColor" strokeWidth="0.75" opacity="0.5" className="lp-glyph-fade" style={{ animationDelay: "410ms" }} />
        <rect x="12" y="17" width="40" height="12" rx="1" stroke="currentColor" strokeWidth="1.25" opacity="0.9" className="lp-glyph-fade" style={{ animationDelay: "540ms" }} />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Your supporters",
    body: "Endorsements from partners, funders, and organizations that know your work. Signed, checkable, and attached to the work itself — not to a platform that controls it.",
    glyph: (
      // Endorsers connected to each other, one countersigned.
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M 32 24 L 17 42 M 32 24 L 47 42 M 17 42 L 47 42"
          pathLength={100}
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.28"
          className="lp-glyph-draw"
          style={{ animationDelay: "300ms" }}
        />
        <circle cx="14" cy="46" r="10" stroke="currentColor" strokeWidth="0.75" opacity="0.28" className="lp-glyph-fade" style={{ animationDelay: "550ms" }} />
        <circle cx="50" cy="46" r="10" stroke="currentColor" strokeWidth="0.75" opacity="0.28" className="lp-glyph-fade" style={{ animationDelay: "670ms" }} />
        <circle cx="32" cy="16" r="10" stroke="currentColor" strokeWidth="1.25" opacity="0.9" className="lp-glyph-fade" style={{ animationDelay: "800ms" }} />
        <circle cx="32" cy="16" r="2.5" fill="currentColor" opacity="0.9" className="lp-glyph-fade" style={{ animationDelay: "920ms" }} />
      </svg>
    ),
  },
];

export default function WhatLivesHere() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="lp-section" aria-labelledby="lp-holdings-title">
      <div className="lp-section__inner lp-split">
        <header className="lp-split__head">
          <span className="lp-eyebrow">What lives here</span>
          <h2 id="lp-holdings-title" className="lp-h2">
            Your Certified account holds three things
          </h2>
        </header>
        <div ref={bodyRef} className={`lp-split__body${inView ? " lp-holdings--inview" : ""}`}>
          {ITEMS.map((item) => (
            <div key={item.num} className="lp-holdings__row">
              <div className="lp-item">
                <span className="lp-item__num">{item.num}</span>
                <h3 className="lp-item__title">{item.title}</h3>
                <p className="lp-item__body">{item.body}</p>
              </div>
              <div className="lp-holdings__glyph">{item.glyph}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
