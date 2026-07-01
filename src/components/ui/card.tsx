import React from "react";

export type CardVariant = "row" | "elevated" | "inset";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * "row"      — transparent bg, bottom-border only, no radius.
   *              Use for list items where the card is a divider row
   *              (feed activity, settings sections, account fields).
   * "elevated" — bg-elevated, full border, var(--radius). Used for
   *              "object" cards (explore people/projects, app tiles,
   *              endorsement summaries).
   * "inset"    — bg-canvas (recessed), full border (--border-default,
   *              same weight as elevated), var(--radius).
   *              Use for inset details inside an elevated parent.
   */
  variant?: CardVariant;
  /** When true, adds a hover-state border highlight. */
  hoverable?: boolean;
  /** When true, drops the default 24 px padding (caller controls). */
  unpadded?: boolean;
  /** Render as a different element (useful for <article>, <li>, <a>). */
  as?: "div" | "article" | "li" | "section";
}

// Canonical border tokens for the card family:
// - Row dividers use --border-subtle (matches tabs.tsx and the vast majority
//   of `border-bottom` divider rules across the app's CSS). This is THE
//   row-divider token — do not reintroduce --border-light here.
// - Full-bordered surfaces (elevated, inset) use --border-default so the two
//   "boxed" variants read as the same weight; only the background recesses.
// All tokens above flip in dark mode (see tokens.css [data-theme="dark"]).
const baseByVariant: Record<CardVariant, string> = {
  row:
    "bg-transparent border-0 border-b border-[var(--border-subtle)] rounded-none",
  elevated:
    "bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded",
  inset:
    "bg-[var(--bg-canvas)] border border-[var(--border-default)] rounded",
};

const hoverByVariant: Record<CardVariant, string> = {
  row: "transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--overlay-weak)]",
  elevated:
    "transition-all duration-150 motion-reduce:transition-none hover:border-[var(--border-hover)] hover:shadow-sm",
  inset:
    "transition-all duration-150 motion-reduce:transition-none hover:border-[var(--border-hover-soft)]",
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "elevated",
      hoverable = false,
      unpadded = false,
      as = "div",
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const padding = unpadded
      ? ""
      : variant === "row"
      ? "py-5"
      : "p-6";
    const cls = `${baseByVariant[variant]} ${padding} ${
      hoverable ? hoverByVariant[variant] : ""
    } ${className}`;

    return React.createElement(
      as,
      { ref, className: cls, ...props },
      children,
    );
  }
);

Card.displayName = "Card";

export default Card;
