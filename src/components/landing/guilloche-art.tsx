/**
 * GuillocheArt — the hero artwork: an engine-turned guilloche rosette,
 * the ornament of banknotes and certificates. Three tonal zones, as on
 * a real plate: an airy outer annulus of offset rings, a woven mid
 * flower of counter-twisted loops, and a quiet core braid. Each
 * zone is ONE path stamped as rotated copies (defs + use), so ink
 * density does the shading — no gradients, currentColor only (the
 * .lp-hero__art wrapper sets color: var(--color-navy), which flips
 * with the theme).
 *
 * The moving effect: the four groups counter-rotate at different
 * speeds (CSS, .lp-guilloche__layer--* in landing.css). The global
 * reduced-motion kill-switch freezes them into a static plate.
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

/** Closed scalloped ring r(t) = base + amp*sin(lobes*t) — the core braid. */
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

const RING_COPIES = 28; // outer annulus
const LOOP_A_COPIES = 16; // mid flower, twisted +
const LOOP_B_COPIES = 12; // mid flower, twisted - (counter-weave)
const CORE_COPIES = 12; // core braid, phase-spread inside one lobe

/**
 * A short bright segment that travels along one of the stamped
 * outlines (dash-offset lap around the normalized path). Rendered
 * INSIDE the same rotating layer group and at the same rotation as an
 * existing copy, so it stays glued to the line it traces.
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
  return (
    <use
      href={href}
      transform={`rotate(${rotate} ${CX} ${CY})`}
      className="lp-guilloche__wander"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      opacity={0.5}
      strokeDasharray={`${dash} ${100 - dash}`}
      vectorEffect="non-scaling-stroke"
      style={{
        animationDuration: `${dur}s`,
        animationDelay: `${delay}s`,
        animationDirection: reverse ? "reverse" : "normal",
      }}
    />
  );
}

export default function GuillocheArt() {
  return (
    <div className="lp-guilloche" aria-hidden="true">
      <svg viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Offset ring: annulus from ~60 to ~370 without touching the core.
              pathLength=100 normalizes dash math for the wanderers; it has
              no effect on the plain (non-dashed) stamped copies. */}
          <circle id="lpg-ring" cx={CX} cy={CY - 215} r={155} pathLength={100} />
          <path id="lpg-loop-a" d={twistedLoopPath(250, 56, 0.58)} pathLength={100} />
          <path id="lpg-loop-b" d={twistedLoopPath(232, 48, -0.66)} pathLength={100} />
          <path id="lpg-core" d={scallopPath(96, 16, 10)} pathLength={100} />
        </defs>

        {/* Zone A: airy outer annulus */}
        <g className="lp-guilloche__layer lp-guilloche__layer--rings">
          {Array.from({ length: RING_COPIES }, (_, i) => (
            <use
              key={i}
              href="#lpg-ring"
              transform={`rotate(${(i * 360) / RING_COPIES} ${CX} ${CY})`}
              stroke="currentColor"
              strokeWidth={0.7}
              opacity={i % 2 === 0 ? 0.17 : 0.12}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <Wanderer href="#lpg-ring" rotate={(3 * 360) / RING_COPIES} dur={26} delay={-4} />
          <Wanderer href="#lpg-ring" rotate={(12 * 360) / RING_COPIES} dur={34} delay={-19} reverse />
          <Wanderer href="#lpg-ring" rotate={(21 * 360) / RING_COPIES} dur={30} delay={-11} />
        </g>

        {/* Zone B: woven mid flower — two counter-twisted, counter-rotating layers */}
        <g className="lp-guilloche__layer lp-guilloche__layer--loops-a">
          {Array.from({ length: LOOP_A_COPIES }, (_, i) => (
            <use
              key={i}
              href="#lpg-loop-a"
              transform={`rotate(${(i * 360) / LOOP_A_COPIES} ${CX} ${CY})`}
              stroke="currentColor"
              strokeWidth={0.7}
              opacity={0.22}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <Wanderer href="#lpg-loop-a" rotate={(2 * 360) / LOOP_A_COPIES} dur={32} delay={-9} dash={6} />
          <Wanderer href="#lpg-loop-a" rotate={(9 * 360) / LOOP_A_COPIES} dur={42} delay={-27} dash={6} reverse />
          <Wanderer href="#lpg-loop-a" rotate={(13 * 360) / LOOP_A_COPIES} dur={37} delay={-2} dash={6} />
        </g>
        <g className="lp-guilloche__layer lp-guilloche__layer--loops-b">
          {Array.from({ length: LOOP_B_COPIES }, (_, i) => (
            <use
              key={i}
              href="#lpg-loop-b"
              transform={`rotate(${(i * 360) / LOOP_B_COPIES} ${CX} ${CY})`}
              stroke="currentColor"
              strokeWidth={0.7}
              opacity={0.18}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <Wanderer href="#lpg-loop-b" rotate={(4 * 360) / LOOP_B_COPIES} dur={36} delay={-14} dash={6} reverse />
          <Wanderer href="#lpg-loop-b" rotate={(10 * 360) / LOOP_B_COPIES} dur={28} delay={-22} dash={6} />
        </g>

        {/* Zone C: quiet core braid */}
        <g className="lp-guilloche__layer lp-guilloche__layer--core">
          {Array.from({ length: CORE_COPIES }, (_, i) => (
            <use
              key={i}
              href="#lpg-core"
              transform={`rotate(${(i * 36) / CORE_COPIES} ${CX} ${CY})`}
              stroke="currentColor"
              strokeWidth={0.7}
              opacity={0.26}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <Wanderer href="#lpg-core" rotate={0} dur={22} delay={-8} dash={10} />
          <Wanderer href="#lpg-core" rotate={18} dur={27} delay={-16} dash={10} reverse />
        </g>

        {/* The account at the center */}
        <circle cx={CX} cy={CY} r={22} stroke="currentColor" strokeWidth={1} opacity={0.5} />
        <circle cx={CX} cy={CY} r={3} fill="currentColor" opacity={0.7} />
      </svg>
    </div>
  );
}
