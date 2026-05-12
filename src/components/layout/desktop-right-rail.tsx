"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PeopleSearch from "@/components/search/people-search";
import { useFeedback } from "@/lib/feedback-context";

/**
 * Right rail (mounted at >=1100px via CSS).
 *
 * Layout:
 *   - Sticky search bar at top (hidden on /search where the page already
 *     hosts a search UI).
 *   - "Suggested people to endorse" — empty-state until a real
 *     suggestions endpoint exists (see docs/profile-rendering/plan.md
 *     open question on data source).
 *   - "Suggested groups to join" — empty-state, same reason.
 *   - Footer: inline single-line link list with · separators. Feedback
 *     opens the existing modal (not a route).
 *
 * Visual specs (DESIGN.md aligned): rail surface --bg-canvas (chrome,
 * not card); items use the .feed-card pattern (hairline separator, no
 * border); no pill-shaped search.
 */
export default function DesktopRightRail() {
  const pathname = usePathname();
  const { openFeedback } = useFeedback();

  // Hide the rail search on the dedicated Explore page (/search) since the
  // page itself hosts the same typeahead at full size.
  const hideSearch = pathname === "/search";

  return (
    <aside
      className="right-rail"
      aria-label="Suggestions and search"
    >
      {!hideSearch && (
        <div className="right-rail__search">
          <PeopleSearch placeholder="Search people" />
        </div>
      )}

      <section className="right-rail__section" aria-labelledby="rr-people">
        <h2 id="rr-people" className="right-rail__heading">
          Suggested to endorse
        </h2>
        <p className="right-rail__empty">No suggestions yet.</p>
      </section>

      <section className="right-rail__section" aria-labelledby="rr-groups">
        <h2 id="rr-groups" className="right-rail__heading">
          Groups to join
        </h2>
        <p className="right-rail__empty">No suggestions yet.</p>
      </section>

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
