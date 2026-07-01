import React from "react";

export type SkeletonVariant = "line" | "box" | "circle" | "text";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  /** Pixel width — or any valid CSS dimension. */
  width?: number | string;
  /** Pixel height. Defaults vary by variant. */
  height?: number | string;
  /**
   * Shortcut for variant="circle": equal width/height and a fully-round
   * radius. Convenience for replacing hand-rolled avatar placeholders.
   * When set, it wins over an explicit `variant`.
   */
  circle?: boolean;
  /**
   * Override the border-radius. A number is treated as pixels; a string is
   * used verbatim. Omit to inherit the default `rounded` (var(--radius), 2px),
   * or the pill radius forced by circle/variant="circle".
   */
  radius?: number | string;
  /** For variant="text", number of stacked lines within one paragraph. */
  lines?: number;
  /**
   * Render N stacked copies of this skeleton (gap-2 column). Defaults to 1.
   * Eases replacing hand-rolled lists of placeholder rows. For the text
   * variant this stacks N paragraphs of `lines` lines each.
   */
  count?: number;
  /** When true, no pulse animation (e.g. when a parent already pulses). */
  noAnimate?: boolean;
  /**
   * Whether to show the pulse animation. Defaults to true. Set `false` for a
   * flat, static token surface (e.g. avatar placeholders that should not
   * pulse). Disabling here is equivalent to `noAnimate`; either one off
   * suppresses the animation.
   */
  animate?: boolean;
}

const baseClass =
  "bg-[var(--overlay-weak)] rounded animate-pulse motion-reduce:animate-none";

const cssFor = (
  variant: SkeletonVariant,
  width: SkeletonProps["width"],
  height: SkeletonProps["height"],
): React.CSSProperties => {
  switch (variant) {
    case "circle":
      // Equal width/height; force radius to a pill.
      return {
        width: width ?? 40,
        height: height ?? width ?? 40,
        borderRadius: "999px",
      };
    case "box":
      return { width: width ?? "100%", height: height ?? 120 };
    case "line":
      return { width: width ?? "100%", height: height ?? 12 };
    case "text":
      // text variant uses an array of lines; this CSS is per-line.
      return { width: width ?? "100%", height: height ?? 12 };
    default:
      return {};
  }
};

// Normalize the radius prop: number -> px, string -> verbatim, undefined -> skip.
const radiusValue = (radius: SkeletonProps["radius"]): string | undefined =>
  radius === undefined
    ? undefined
    : typeof radius === "number"
      ? `${radius}px`
      : radius;

const Skeleton: React.FC<SkeletonProps> = ({
  variant = "box",
  width,
  height,
  circle = false,
  radius,
  lines = 3,
  count = 1,
  noAnimate = false,
  animate = true,
  className = "",
  style,
  ...props
}) => {
  // `circle` is sugar for the circle variant and wins over an explicit variant.
  const resolvedVariant: SkeletonVariant = circle ? "circle" : variant;
  const radiusOverride = radiusValue(radius);
  // The pulse is suppressed when either signal is off: `animate={false}` or the
  // legacy `noAnimate`. A static skeleton is a flat token surface.
  const isStatic = !animate || noAnimate;
  // Circles must keep their size in a flex row instead of being squeezed.
  const circleCls = resolvedVariant === "circle" ? "shrink-0" : "";
  // Stack at least one copy; a non-positive count collapses to a single item.
  const repeat = Math.max(1, Math.floor(count));

  if (resolvedVariant === "text") {
    // One paragraph = `lines` stacked bars, last one ragged (60%) to avoid the
    // "newspaper paragraph" look. Returned as a fragment so the single-paragraph
    // case keeps its original DOM shape (root carries aria-hidden + props).
    const paragraphLines = (
      <>
        {Array.from({ length: lines }).map((_, i) => {
          // Earlier lines honor the documented `width` prop (default 100%).
          const w = i === lines - 1 ? "60%" : (width ?? "100%");
          return (
            <div
              key={i}
              className={`${baseClass} ${isStatic ? "!animate-none" : ""}`}
              style={{
                ...style,
                width: w,
                height: height ?? 12,
                ...(radiusOverride !== undefined
                  ? { borderRadius: radiusOverride }
                  : {}),
              }}
            />
          );
        })}
      </>
    );

    if (repeat === 1) {
      // Preserve the original single-paragraph DOM shape.
      return (
        <div aria-hidden className={`flex flex-col gap-2 ${className}`} {...props}>
          {paragraphLines}
        </div>
      );
    }

    return (
      <div aria-hidden className={`flex flex-col gap-4 ${className}`} {...props}>
        {Array.from({ length: repeat }).map((_, p) => (
          <div key={p} aria-hidden className="flex flex-col gap-2">
            {paragraphLines}
          </div>
        ))}
      </div>
    );
  }

  const itemCls =
    `${baseClass} ${isStatic ? "!animate-none" : ""} ${circleCls}`.trim();
  const itemStyle: React.CSSProperties = {
    ...cssFor(resolvedVariant, width, height),
    ...style,
    ...(radiusOverride !== undefined ? { borderRadius: radiusOverride } : {}),
  };

  if (repeat === 1) {
    // Preserve the original single-element DOM shape.
    return (
      <div aria-hidden className={`${itemCls} ${className}`.trim()} style={itemStyle} {...props} />
    );
  }

  return (
    <div aria-hidden className={`flex flex-col gap-2 ${className}`.trim()} {...props}>
      {Array.from({ length: repeat }).map((_, i) => (
        <div key={i} aria-hidden className={itemCls} style={itemStyle} />
      ))}
    </div>
  );
};

export default Skeleton;
