import Link from "next/link"
import Brandmark from "@/components/ui/brandmark"

/**
 * Minimal site footer — GitHub-flavour. Single horizontal row at
 * desktop: small brandmark + copyright on the left, link list on
 * the right. Wraps to two stacked rows on narrow viewports.
 *
 * Rendered as a sibling of `.app-shell__grid` (NOT inside it) so
 * the footer spans the full viewport width on every page — its
 * border-top reads as a page-frame divider that matches the
 * navbar's border-bottom edge-to-edge.
 *
 * Kept intentionally short — no marketing copy, no newsletter
 * signup, no social rail. Just identity + a handful of links the
 * visitor might genuinely want.
 */
export default function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer__row">
        <div className="site-footer__left">
          <Brandmark size={16} className="site-footer__brand" aria-hidden />
          <span className="site-footer__copy">
            © {year} Hypercerts Foundation
          </span>
        </div>
        <nav className="site-footer__nav" aria-label="Footer links">
          <Link href="/about" className="site-footer__link">
            About
          </Link>
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
    </footer>
  )
}
