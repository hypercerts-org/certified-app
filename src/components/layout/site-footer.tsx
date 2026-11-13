"use client"

import Link from "next/link"
import { useFeedback } from "@/lib/feedback-context"

/**
 * Minimal site footer — GitHub-flavour. Single horizontal row at
 * desktop: wordmark + copyright on the left, the links and Feedback on
 * the right. Wraps to stacked, centred rows on narrow viewports.
 *
 * Rendered by AppShell after `<main>` (not inside it), so it is the
 * page's contentinfo landmark and spans the full viewport width on every
 * page — its border-top reads as a page-frame divider that matches the
 * navbar's border-bottom edge-to-edge.
 *
 * Help and Feedback are here for everyone: signed-out visitors have no
 * account menu (where signed-in people also find them). This is the one
 * Feedback button on the page; there is no floating one. The theme switch
 * lives in the account menu (Appearance), not here.
 *
 * Kept intentionally short — no marketing copy, no newsletter
 * signup, no social rail. Just identity + a handful of links the
 * visitor might genuinely want.
 */
export default function SiteFooter() {
  const year = new Date().getFullYear()
  const { openFeedback } = useFeedback()
  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer__row">
        <div className="site-footer__left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/wordmark/certified_wordmark_black.svg"
            alt="Certified"
            className="site-footer__wordmark"
          />
          <span className="site-footer__copy">
            © {year} Hypercerts Foundation
          </span>
        </div>
        <div className="site-footer__end">
          <nav className="site-footer__nav" aria-label="Footer links">
            <Link href="/welcome" className="site-footer__link">
              Welcome
            </Link>
            <Link href="/help" className="site-footer__link">
              Help
            </Link>
            <button
              type="button"
              className="site-footer__link site-footer__link--button"
              onClick={() => openFeedback()}
            >
              Feedback
            </button>
            <a
              href="https://docs.hypercerts.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="site-footer__link"
            >
              Docs
            </a>
            <Link href="/terms" className="site-footer__link">
              Terms
            </Link>
            <Link href="/privacy" className="site-footer__link">
              Privacy
            </Link>
            <Link href="/imprint" className="site-footer__link">
              Imprint
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
