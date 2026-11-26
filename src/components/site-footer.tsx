import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const COPYRIGHT_YEAR = 2026;

/**
 * Minimal site footer shared by the app shell and the landing page: wordmark +
 * copyright on the left, product and legal links on the right. Static Server
 * Component so cached pages stay cached.
 */
export function SiteFooter({ variant = "app" }: { variant?: "app" | "landing" }) {
  return (
    <footer className={variant === "landing" ? "site-footer site-footer--landing" : "site-footer"}>
      <div className="site-footer-row">
        <div className="site-footer-left">
          <span className="site-footer-brand">
            <Image
              src="/brand/wordmark/certified_wordmark_black.svg"
              alt="Certified"
              width={72}
              height={14}
              className="site-footer-wordmark"
            />
            <span className="site-footer-suffix" aria-hidden>
              .app
            </span>
          </span>
          <span className="site-footer-copy">© {COPYRIGHT_YEAR} Hypercerts Foundation</span>
        </div>
        <nav className="site-footer-nav" aria-label="Footer links">
          <span className="site-footer-group">
            <Link href="/welcome" className="site-footer-link">
              Welcome
            </Link>
            <Link href="/explore" className="site-footer-link">
              Explore
            </Link>
            <Link href="/apps" className="site-footer-link">
              Apps
            </Link>
            <a
              href="https://docs.hypercerts.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="site-footer-link"
            >
              Docs
              <ArrowUpRight size={12} strokeWidth={1.75} aria-hidden />
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </span>
          <span className="site-footer-group">
            <Link href="/terms" className="site-footer-link">
              Terms
            </Link>
            <Link href="/privacy" className="site-footer-link">
              Privacy
            </Link>
            <Link href="/imprint" className="site-footer-link">
              Imprint
            </Link>
            <Link href="/dsa" className="site-footer-link">
              DSA
            </Link>
          </span>
        </nav>
      </div>
    </footer>
  );
}
