"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer__inner">
        <div className="landing-footer__brand">
          <img
            src="/assets/certified_wordmark_black.svg"
            alt="Certified"
            className="landing-footer__logo-img"
          />
          <p className="landing-footer__tagline">
            Passwordless identity for the open social internet. Built on AT Protocol.
          </p>
          <a
            className="landing-footer__atproto"
            href="https://atproto.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="landing-footer__atproto-dot" aria-hidden="true" />
            Powered by AT Protocol
          </a>
        </div>

        <nav className="landing-footer__nav" aria-label="Footer">
          <div className="landing-footer__col">
            <h5 className="landing-footer__heading">Product</h5>
            <Link href="/welcome">Overview</Link>
            <Link href="/welcome#what-you-get">Benefits</Link>
            <Link href="/welcome#how-it-works">How it works</Link>
            <Link href="/welcome#partner-apps">Partner apps</Link>
          </div>
          <div className="landing-footer__col">
            <h5 className="landing-footer__heading">Company</h5>
            <Link href="/about">About</Link>
            <a
              href="https://hypercerts.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Hypercerts Foundation
            </a>
            <Link href="/welcome#faq">FAQ</Link>
          </div>
          <div className="landing-footer__col">
            <h5 className="landing-footer__heading">Legal</h5>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/dsa">DSA</Link>
          </div>
        </nav>
      </div>

      <div className="landing-footer__bottom">
        <span className="landing-footer__copy">
          &copy; 2026 Hypercerts Foundation. All rights reserved.
        </span>
        <span className="landing-footer__bottom-spacer" aria-hidden="true" />
        <span className="landing-footer__bottom-meta">
          Made with care for an open identity layer.
        </span>
      </div>
    </footer>
  );
}
