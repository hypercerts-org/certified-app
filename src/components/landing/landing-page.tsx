import Link from "next/link";
import WhatYouGet from "@/components/landing/sections/what-you-get";
import HowItWorks from "@/components/landing/sections/how-it-works";
import PartnerApps from "@/components/landing/sections/partner-apps";
import BuiltForTrust from "@/components/landing/sections/built-for-trust";
import FaqSection from "@/components/landing/sections/faq-content";
import ReadyCtaSection from "@/components/landing/sections/ready-cta-content";
import HeroSignInButton from "@/components/landing/hero-signin-button";

export default function LandingPage() {
  return (
    <>
      <section className="hero hero--landing">
        {/* Line-art pattern background */}
        <div className="hero__pattern" aria-hidden="true">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <circle cx="50%" cy="50%" r="300" fill="none" stroke="currentColor" strokeWidth="0.3" />
            <circle cx="50%" cy="50%" r="400" fill="none" stroke="currentColor" strokeWidth="0.15" />
            <line x1="0%" y1="0%" x2="100%" y2="100%" stroke="currentColor" strokeWidth="0.15" />
            <line x1="100%" y1="0%" x2="0%" y2="100%" stroke="currentColor" strokeWidth="0.15" />
          </svg>
        </div>

        <div className="hero__inner">
          <span className="hero__label">Built on AT Protocol</span>
          <h1 className="hero__title hero-reveal">
            One account.<br />
            <span className="hero__title-accent">Any app.</span>
          </h1>
          <p className="hero__subtitle hero-reveal">
            Your identity and data — everywhere you go.
          </p>
          <div className="hero-reveal">
            <HeroSignInButton />
          </div>
        </div>
      </section>
      <WhatYouGet />
      <HowItWorks />
      <PartnerApps />
      <BuiltForTrust />
      <FaqSection />
      <ReadyCtaSection />
      <footer className="landing-footer" id="landing-footer">
        <div className="landing-footer__bar">
          <div className="landing-footer__left">
            <img src="/assets/certified_wordmark_black_green.png" alt="Certified" className="landing-footer__logo-img" />
            <span className="landing-footer__copy">&copy; 2026 Hypercerts Foundation</span>
          </div>
          <div className="landing-footer__links">
            <Link href="/about">About</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
