/**
 * Inline links in Help copy: primary text with a quiet underline that
 * darkens on hover. A plain module (not "use client") so the server-rendered
 * Help page and its client islands can share it.
 */
export const helpLinkCls =
  "text-[var(--fg-primary)] underline decoration-[var(--border-hover)] underline-offset-2 transition-[text-decoration-color] duration-fast motion-reduce:transition-none hover:decoration-[var(--fg-primary)] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
