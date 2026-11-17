"use client"

import Link from "next/link"
import { useFeedback } from "@/lib/feedback-context"
import Wordmark from "@/components/ui/wordmark"

/**
 * Minimal site footer — GitHub-flavour. Single horizontal row at
 * desktop: wordmark + copyright on the left, the links and Feedback on
 * the right. Wraps to stacked, centred rows on narrow viewports.
 *
 * Rendered by AppShell after `<main>` (not inside it), so it is the
 * page's contentinfo landmark and spans the page's width, beside the
 * desktop sidebar (the body is padded by it).
 *
 * Help and Feedback are here for everyone (signed-in people also find
 * them at the bottom of the sidebar and in the phone pill's More). There
 * is no floating Feedback button. The theme switch lives in Settings
 * (Appearance), not here.
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
          <Wordmark variant="certified-app" faded height={14} className="site-footer__wordmark" />
          <span className="site-footer__copy">
            © {year} Hypercerts Foundation
          </span>
        </div>
        <div className="site-footer__end">
          {/* Two groups: on phones each is its own line (the app's links,
              then the legal ones); on desktop they share the row. */}
          <nav className="site-footer__nav" aria-label="Footer links">
            <span className="site-footer__group">
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
            </span>
            <span className="site-footer__group">
              <Link href="/terms" className="site-footer__link">
                Terms
              </Link>
              <Link href="/privacy" className="site-footer__link">
                Privacy
              </Link>
              <Link href="/imprint" className="site-footer__link">
                Imprint
              </Link>
            </span>
          </nav>
        </div>
      </div>
    </footer>
  )
}
