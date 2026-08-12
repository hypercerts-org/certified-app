"use client";

import { useEffect, useRef } from "react";

/**
 * GuillocheArt — the hero artwork: an engine-turned guilloche plate,
 * the ornament of banknotes and certificates, tilted into perspective
 * and coupled to the page scroll (the winner of the June 2026 variant
 * exploration: "Scroll 3D").
 *
 * The plate continuously morphs through three patterns — ring field ->
 * loop rosette -> star — via SMIL path interpolation (every shape is
 * sampled with the same point count so the d structures match). Each
 * pattern zone is ONE path stamped as rotated copies (defs + use), so
 * ink density does the shading: currentColor hairlines at opacity
 * tiers, no gradients (the .lp-hero__art wrapper sets color:
 * var(--color-navy), which flips with the theme). During the star
 * passage the rotated fan alone would read as a braid, so a nested
 * star swirl cross-fades in while the fan recedes.
 *
 * Motion: the layer groups counter-rotate (CSS), "wanderer" segments
 * with comet-dot heads lap along the stamped outlines, and the 3D rig
 * is scrubbed by scroll — spin 0.3deg/px, tilt 38deg -> 62deg cap
 * (rAF-throttled listener feeding CSS vars; see .lp-guilloche--3d in
 * landing.css). Reduced motion: the CSS kill-switch freezes the
 * rotations/wanderers, and this component additionally pauses the
 * SMIL morph and skips the scroll listener, leaving a static tilted
 * plate.
 */

const CX = 400;
const CY = 400;

/**
 * A slim ellipse (waist x reach) bent into an S through the center:
 * each point is rotated by twist*sin(t), so the lobe tips shear in
 * opposite directions — the signature guilloche loop.
 */
function twistedLoopPath(reach: number, waist: number, twist: number, points = 160): string {
  let d = "";
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * Math.PI * 2;
    const u = waist * Math.cos(t);
    const v = reach * Math.sin(t);
    const a = twist * Math.sin(t);
    const x = CX + u * Math.cos(a) - v * Math.sin(a);
    const y = CY + u * Math.sin(a) + v * Math.cos(a);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d + "Z";
}

/** Closed scalloped ring r(t) = base + amp*sin(lobes*t). */
function scallopPath(base: number, amp: number, lobes: number, points = 200): string {
  let d = "";
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * Math.PI * 2;
    const r = base + amp * Math.sin(lobes * t);
    const x = CX + r * Math.cos(t);
    const y = CY + r * Math.sin(t);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d + "Z";
}

/** Plain circle of radius r centered offsetY above the plate center,
 *  sampled like the other generators so it can SMIL-morph into them. */
function offsetRingPath(r: number, offsetY: number, points = 200): string {
  let d = "";
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * Math.PI * 2;
    const x = CX + r * Math.cos(t);
    const y = CY + offsetY + r * Math.sin(t);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d + "Z";
}

const FLOW_DUR = "60s";
const FLOW_KEYTIMES = "0;0.333;0.667;1";

/** One continuous linear lap through the three shapes (same point
 *  count each — SMIL d interpolation requires matching structures). */
function MorphPath({ id, shapes }: { id: string; shapes: string[] }) {
  const values = [shapes[0], shapes[1], shapes[2], shapes[0]].join(";");
  return (
    <path id={id} d={shapes[0]} pathLength={100}>
      <animate
        attributeName="d"
        dur={FLOW_DUR}
        repeatCount="indefinite"
        values={values}
        keyTimes={FLOW_KEYTIMES}
      />
    </path>
  );
}

/** Opacity ride along the cycle: one value per keyTime. */
function CycleFade({ values }: { values: string }) {
  return (
    <animate
      attributeName="opacity"
      dur={FLOW_DUR}
      repeatCount="indefinite"
      values={values}
      keyTimes={FLOW_KEYTIMES}
    />
  );
}

function Layer({
  dur,
  reverse = false,
  children,
}: {
  dur: number;
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <g
      className="lp-guilloche__layer"
      style={{ animationDuration: `${dur}s`, animationDirection: reverse ? "reverse" : "normal" }}
    >
      {children}
    </g>
  );
}

function stamps(href: string, copies: number, spreadDeg: number, opacity: (i: number) => number) {
  return Array.from({ length: copies }, (_, i) => (
    <use
      key={i}
      href={href}
      transform={`rotate(${(i * spreadDeg) / copies} ${CX} ${CY})`}
      stroke="currentColor"
      strokeWidth={0.7}
      opacity={opacity(i)}
      vectorEffect="non-scaling-stroke"
    />
  ));
}

/**
 * A short bright segment that travels along one of the stamped
 * outlines (dash-offset lap around the normalized path), with a small
 * round dot riding its leading edge. Rendered INSIDE the same rotating
 * layer group, so it stays glued to the line it traces.
 *
 * The dot is a point-length dash on a second use of the same path,
 * phase-shifted by the segment length so it sits at the front (the
 * lpWanderDot<dash> keyframes; when the wanderer runs in reverse the
 * leading edge is the pattern start, so the dot laps unshifted).
 */
function Wanderer({
  href,
  rotate,
  dur,
  delay,
  dash = 8,
  reverse = false,
}: {
  href: string;
  rotate: number;
  dur: number;
  delay: number;
  dash?: number;
  reverse?: boolean;
}) {
  const transform = `rotate(${rotate} ${CX} ${CY})`;
  const timing: React.CSSProperties = {
    animationDuration: `${dur}s`,
    animationDelay: `${delay}s`,
    animationDirection: reverse ? "reverse" : "normal",
  };
  return (
    <>
      <use
        href={href}
        transform={transform}
        className="lp-guilloche__wander"
        stroke="currentColor"
        strokeWidth={1.1}
        strokeLinecap="round"
        opacity={0.5}
        strokeDasharray={`${dash} ${100 - dash}`}
        vectorEffect="non-scaling-stroke"
        style={timing}
      />
      <use
        href={href}
        transform={transform}
        className="lp-guilloche__wander-dot"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        opacity={0.65}
        strokeDasharray="0.001 99.999"
        vectorEffect="non-scaling-stroke"
        style={{ ...timing, animationName: reverse ? "lpRingSpin" : `lpWanderDot${dash}` }}
      />
    </>
  );
}

const QUIET_OUTER = twistedLoopPath(320, 64, 0.55);
const QUIET_INNER = twistedLoopPath(250, 48, -0.62);

/**
 * Quiet, non-morphing guilloche for the organizations band's
 * background: two counter-rotating loop fans inside a containment
 * ring, no wanderers — the hero plate carries the spectacle. Inherits
 * currentColor from the band wrapper (which also halves its opacity).
 */
export function GuillocheQuiet() {
  return (
    <div className="lp-guilloche" aria-hidden="true">
      <svg viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <path id="lpg-quiet-outer" d={QUIET_OUTER} />
          <path id="lpg-quiet-inner" d={QUIET_INNER} />
        </defs>
        <circle cx={CX} cy={CY} r={372} stroke="currentColor" strokeWidth={0.75} opacity={0.3} vectorEffect="non-scaling-stroke" />
        <Layer dur={260}>{stamps("#lpg-quiet-outer", 16, 360, () => 0.3)}</Layer>
        <Layer dur={180} reverse>
          {stamps("#lpg-quiet-inner", 12, 360, () => 0.24)}
        </Layer>
      </svg>
    </div>
  );
}

const OUTER_SHAPES = [
  offsetRingPath(135, -230, 200),
  twistedLoopPath(335, 62, 0.58, 200),
  scallopPath(230, 105, 6, 200),
];
const INNER_SHAPES = [
  offsetRingPath(110, -245, 200),
  twistedLoopPath(272, 54, -0.66, 200),
  scallopPath(130, 60, 6, 200),
];
const STAR_PATH = scallopPath(150, 70, 6, 280);
const NEST_SCALES = Array.from({ length: 11 }, (_, i) => 0.22 + i * 0.123);
const COUNTER_SCALES = Array.from({ length: 5 }, (_, i) => 0.28 + i * 0.11);
const FAN_FADE = "1;1;0.3;1";
const NEST_FADE = "0;0;1;0";

export default function GuillocheArt({
  idPrefix = "lpg",
  flat = false,
  frame = true,
}: {
  /** Unique SVG-id namespace — required when the plate renders more
   *  than once per page (defs/use references are document-global). */
  idPrefix?: string;
  /** Render the morphing plate without the 3D rig and without the
   *  scroll scrubbing (e.g. the closing section's corner). */
  flat?: boolean;
  /** Containment rings around the plate. Off in the closing corner,
   *  where the quadrant should fan out unbounded. */
  frame?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // The CSS kill-switch freezes the rotations; SMIL needs its own
      // brake, and the scroll scrubbing stays off — a static plate.
      el.querySelectorAll("svg").forEach((svg) => svg.pauseAnimations());
      return;
    }
    if (flat) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      el.style.setProperty("--lpg-scroll-spin", `${(y * 0.3).toFixed(2)}deg`);
      el.style.setProperty("--lpg-scroll-tilt", `${Math.min(38 + y / 9, 62).toFixed(2)}deg`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [flat]);

  const plate = (
    <div className="lp-guilloche__plate">
      <svg viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <MorphPath id={`${idPrefix}-outer`} shapes={OUTER_SHAPES} />
          <MorphPath id={`${idPrefix}-inner`} shapes={INNER_SHAPES} />
          <path id={`${idPrefix}-star`} d={STAR_PATH} pathLength={100} />
        </defs>

        {/* Containment rings — the plate's frame */}
        {frame && (
          <>
            <circle cx={CX} cy={CY} r={372} stroke="currentColor" strokeWidth={0.75} opacity={0.16} vectorEffect="non-scaling-stroke" />
            <circle cx={CX} cy={CY} r={380} stroke="currentColor" strokeWidth={0.75} opacity={0.1} vectorEffect="non-scaling-stroke" />
          </>
        )}

        {/* Morphing fan — outer and inner counter-rotating zones */}
        <Layer dur={190}>
          <CycleFade values={FAN_FADE} />
          {stamps(`#${idPrefix}-outer`, 24, 360, (i) => (i % 2 === 0 ? 0.17 : 0.12))}
          <Wanderer href={`#${idPrefix}-outer`} rotate={15} dur={30} delay={-8} />
          <Wanderer href={`#${idPrefix}-outer`} rotate={105} dur={34} delay={-16} reverse />
          <Wanderer href={`#${idPrefix}-outer`} rotate={195} dur={38} delay={-21} reverse />
        </Layer>
        <Layer dur={130} reverse>
          <CycleFade values={FAN_FADE} />
          {stamps(`#${idPrefix}-inner`, 16, 360, () => 0.2)}
          <Wanderer href={`#${idPrefix}-inner`} rotate={45} dur={26} delay={-13} dash={6} reverse />
          <Wanderer href={`#${idPrefix}-inner`} rotate={225} dur={34} delay={-3} dash={6} />
        </Layer>

        {/* The nested star swirl, cross-fading in around the star passage */}
        <Layer dur={200}>
          <CycleFade values={NEST_FADE} />
          {NEST_SCALES.map((s, i) => (
            <use
              key={i}
              href={`#${idPrefix}-star`}
              transform={`rotate(${i * 4} ${CX} ${CY}) translate(${(CX * (1 - s)).toFixed(1)} ${(CY * (1 - s)).toFixed(1)}) scale(${s.toFixed(4)})`}
              stroke="currentColor"
              strokeWidth={0.7}
              opacity={0.4 - i * 0.025}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <Wanderer href={`#${idPrefix}-star`} rotate={0} dur={28} delay={-7} dash={8} />
          <Wanderer href={`#${idPrefix}-star`} rotate={120} dur={34} delay={-19} dash={8} reverse />
          <Wanderer href={`#${idPrefix}-star`} rotate={240} dur={31} delay={-12} dash={8} />
        </Layer>
        <Layer dur={160} reverse>
          <CycleFade values={NEST_FADE} />
          <Wanderer href={`#${idPrefix}-star`} rotate={30} dur={26} delay={-4} dash={6} reverse />
          <Wanderer href={`#${idPrefix}-star`} rotate={210} dur={36} delay={-23} dash={6} />
          {COUNTER_SCALES.map((s, i) => (
            <use
              key={i}
              href={`#${idPrefix}-star`}
              transform={`rotate(${30 + i * 5} ${CX} ${CY}) translate(${(CX * (1 - s)).toFixed(1)} ${(CY * (1 - s)).toFixed(1)}) scale(${s.toFixed(4)})`}
              stroke="currentColor"
              strokeWidth={0.7}
              opacity={0.3 - i * 0.03}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </Layer>
      </svg>
    </div>
  );

  if (flat) {
    return (
      <div ref={ref} className="lp-guilloche" aria-hidden="true">
        {plate}
      </div>
    );
  }

  return (
    <div ref={ref} className="lp-guilloche lp-guilloche--3d" aria-hidden="true">
      <div className="lp-g3d-tilt">
        <div className="lp-g3d-spin">{plate}</div>
      </div>
    </div>
  );
}
