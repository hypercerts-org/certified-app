"use client";

import React from "react";
import Link from "next/link";
import NewsSection from "@/components/right-rail/news-section";
import { useFeedback } from "@/lib/feedback-context";

/**
 * Right rail (mounted at >=1100px via CSS).
 *
 * Layout (post-redesign):
 *   - "News" — latest Bluesky posts from @certified.app, paged via a
 *     "More" control that hides itself when the timeline is exhausted.
 *   - Footer: inline single-line link list with · separators. Feedback
 *     opens the existing modal (not a route).
 *
 * Search moved to the desktop top bar in the positioning redesign and is
 * no longer hosted here.
 *
 * Visual specs (DESIGN.md aligned): rail surface --bg-canvas (chrome,
 * not card); items use the .feed-card pattern (hairline separator, no
 * border).
 */
export default function DesktopRightRail() {
  const { openFeedback } = useFeedback();

  return (
    <aside
      className="right-rail"
      aria-label="News and links"
    >
      <NewsSection />

      <footer className="right-rail__footer">
        <Link href="/about" className="right-rail__footer-link">About</Link>
        <span className="right-rail__footer-sep" aria-hidden>·</span>
        <Link href="/terms" className="right-rail__footer-link">Terms</Link>
        <span className="right-rail__footer-sep" aria-hidden>·</span>
        <Link href="/privacy" className="right-rail__footer-link">Privacy</Link>
        <span className="right-rail__footer-sep" aria-hidden>·</span>
        <button
          type="button"
          className="right-rail__footer-link"
          onClick={openFeedback}
        >
          Feedback
        </button>
      </footer>
    </aside>
  );
}
