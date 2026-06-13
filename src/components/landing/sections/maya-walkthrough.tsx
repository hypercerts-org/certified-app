"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "How it feels in practice" — one person's story in three steps,
 * with the Travelling Record artwork: a record token (stacked layers
 * with a seal mark) that moves between three platform frames as the
 * reader scrolls the steps. The desktop artwork is sticky beside the
 * steps; below 800px a compact horizontal variant renders above them.
 *
 * Scroll-linking is an IntersectionObserver setting data-step on the
 * section — the movement itself is a CSS transform transition, so the
 * global reduced-motion kill-switch (tokens.css) collapses it to an
 * instant, discrete position change instead of motion.
 */

const STEPS = [
  {
    num: "01",
    title: "She raises funding",
    body: "Maya raised funding for her organization on a crowdfunding app like Ma Earth. Her project page, updates, and supporters were saved to a Certified record automatically — held by her or her organization, whichever fits.",
  },
  {
    num: "02",
    title: "Her record speaks for her",
    body: "A monitoring partner adds bioacoustic evidence of the watershed's recovery to her record. A foundation she's never met finds her account, sees her work and who vouched for it, and reaches out.",
  },
  {
    num: "03",
    title: "She never starts over",
    body: "Next quarter she applies to a grants platform or enters a prize competition. No new profile, nothing to fill in again. Her record and the trust signals from others come with her.",
  },
];

/** Frame top-left corners + token waypoints (frame centers), diagonal layout. */
const FRAMES = [
  { x: 40, y: 60 },
  { x: 245, y: 245 },
  { x: 450, y: 430 },
];
const SIZE = 150;

function RecordToken() {
  // Five stacked layers, newest on top; the fifth fades in at step 3
  // (the record growing on arrival). Drawn centered on (0,0).
  const layers = [0.14, 0.2, 0.28, 0.4];
  return (
    <g className="lp-story__token">
      {layers.map((opacity, i) => (
        <rect
          key={i}
          x={-36}
          y={-22 - i * 8}
          width={72}
          height={44}
          rx={2}
          stroke="currentColor"
          strokeWidth={0.75}
          opacity={opacity}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <rect x={-36} y={-54} width={72} height={44} rx={2} stroke="currentColor" strokeWidth={1.25} opacity={0.9} />
      {/* Seal mark on the top layer */}
      <circle cx={22} cy={-42} r={7} stroke="currentColor" strokeWidth={1.25} opacity={0.9} />
      <circle cx={22} cy={-42} r={1.8} fill="currentColor" opacity={0.9} />
      {/* The layer added when the record travels (step 3) */}
      <rect className="lp-story__token-new" x={-36} y={-62} width={72} height={44} rx={2} stroke="currentColor" strokeWidth={1.25} opacity={0.9} />
    </g>
  );
}

function StoryArt({ variant }: { variant: "diagonal" | "row" }) {
  const frames =
    variant === "diagonal"
      ? FRAMES
      : [
          { x: 40, y: 45 },
          { x: 245, y: 45 },
          { x: 450, y: 45 },
        ];
  const viewBox = variant === "diagonal" ? "0 0 640 640" : "0 0 640 240";
  const centers = frames.map((f) => ({ x: f.x + SIZE / 2, y: f.y + SIZE / 2 }));

  return (
    <div className={`lp-story__art lp-story__art--${variant}`} aria-hidden="true">
      <svg viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Dashed route through the three platforms */}
        <path
          d={`M ${centers[0].x} ${centers[0].y} L ${centers[1].x} ${centers[1].y} L ${centers[2].x} ${centers[2].y}`}
          stroke="currentColor"
          strokeWidth={0.75}
          strokeDasharray="2 7"
          opacity={0.2}
          vectorEffect="non-scaling-stroke"
        />
        {/* Platform frames */}
        {frames.map((f, i) => (
          <rect
            key={i}
            className="lp-story__frame"
            data-frame={i + 1}
            x={f.x}
            y={f.y}
            width={SIZE}
            height={SIZE}
            rx={4}
            stroke="currentColor"
            strokeWidth={0.75}
            opacity={0.28}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* Token positions are driven by data-step on the section (CSS). */}
        <RecordToken />
      </svg>
    </div>
  );
}

export default function MayaWalkthrough() {
  const [step, setStep] = useState(1);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    // A narrow horizontal band around 40-45% of the viewport: only the
    // step crossing it intersects, so tall viewports that show several
    // steps at once can't skip the choreography straight to step 3.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = stepRefs.current.indexOf(entry.target as HTMLDivElement);
          if (idx !== -1) setStep(idx + 1);
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );
    for (const el of stepRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="lp-section lp-story"
      data-step={step}
      aria-labelledby="lp-story-title"
    >
      <div className="lp-section__inner lp-story__grid">
        <div className="lp-story__sticky">
          <StoryArt variant="diagonal" />
        </div>
        <div className="lp-story__steps">
          <header>
            <span className="lp-eyebrow">How it feels in practice</span>
            <h2 id="lp-story-title" className="lp-h2">
              Maya runs a watershed restoration project
            </h2>
          </header>
          <StoryArt variant="row" />
          {STEPS.map((s, i) => (
            <div
              key={s.num}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              className="lp-story__step lp-item"
              data-active={step === i + 1}
            >
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
