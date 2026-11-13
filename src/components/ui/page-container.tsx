import React from "react";

export type PageContainerWidth = "narrow" | "default" | "wide";

export interface PageContainerProps {
  /**
   * Content width: `narrow` 720px (Help, forms), `default` 1120px,
   * `wide` 1280px (profile). The gutters sit outside this width.
   */
  width?: PageContainerWidth;
  /** Element to render. `<main>` is already the shell's, so not offered. */
  as?: "div" | "section" | "article";
  className?: string;
  children: React.ReactNode;
}

const widthVar: Record<PageContainerWidth, string> = {
  narrow: "[--page-width:var(--page-width-narrow)]",
  default: "[--page-width:var(--page-width-default)]",
  wide: "[--page-width:var(--page-width-wide)]",
};

/**
 * The page frame for a top-level page (DESIGN.md §4.6, §9.13): centred, a
 * max content width, and the standard gutters and top/bottom space.
 *
 * - Below 800px the shell supplies the 16px side gutter; the container adds
 *   8px on top (24px below the navbar in all) and 32px at the bottom.
 * - From 800px: 24px sides, 32px top, 64px bottom. From 1100px: 32px sides.
 *
 * The `page-container` class opts the page into the shell's page-frame
 * layout (layout.css), which lifts the 600px desktop reading column so the
 * container can reach its own width. `w-full` keeps it full width inside
 * that frame's flex column, where `mx-auto` alone would shrink it to fit.
 */
export default function PageContainer({
  width = "default",
  as = "div",
  className = "",
  children,
}: PageContainerProps) {
  const cls = [
    "page-container mx-auto box-border w-full",
    widthVar[width],
    // The gutter is a custom property so the max width can add it back:
    // max-width = content width + both gutters.
    "[--page-gutter:0px] md:[--page-gutter:24px] lg:[--page-gutter:32px]",
    "px-[var(--page-gutter)] max-w-[calc(var(--page-width)_+_2_*_var(--page-gutter))]",
    "pb-8 pt-2 md:pb-16 md:pt-8",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return React.createElement(as, { className: cls }, children);
}
