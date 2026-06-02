import React from "react";

export type SkeletonVariant = "line" | "box" | "circle" | "text";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  /** Pixel width — or any valid CSS dimension. */
  width?: number | string;
  /** Pixel height. Defaults vary by variant. */
  height?: number | string;
  /** For variant="text", number of stacked lines. */
  lines?: number;
  /** When true, no pulse animation (e.g. when a parent already pulses). */
  noAnimate?: boolean;
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

const Skeleton: React.FC<SkeletonProps> = ({
  variant = "box",
  width,
  height,
  lines = 3,
  noAnimate = false,
  className = "",
  style,
  ...props
}) => {
  const cls = `${baseClass} ${noAnimate ? "!animate-none" : ""} ${className}`.trim();

  if (variant === "text") {
    return (
      <div
        aria-hidden
        className={`flex flex-col gap-2 ${className}`}
        {...props}
      >
        {Array.from({ length: lines }).map((_, i) => {
          // Last line is 60% to avoid the "newspaper paragraph" look;
          // earlier lines honor the documented `width` prop (default 100%).
          const w = i === lines - 1 ? "60%" : (width ?? "100%");
          return (
            <div
              key={i}
              className={`${baseClass} ${noAnimate ? "!animate-none" : ""}`}
              style={{ ...style, width: w, height: height ?? 12 }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={cls}
      style={{ ...cssFor(variant, width, height), ...style }}
      {...props}
    />
  );
};

export default Skeleton;
