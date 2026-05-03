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
        {/* Soft radial brand glow (blue) sits behind the grid pattern */}
        <div className="hero__glow" aria-hidden="true" />

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
          <a className="hero__chip hero-reveal" href="#built-for-trust">
            <span className="hero__chip-dot" aria-hidden="true" />
            Built on AT Protocol
            <span className="hero__chip-arrow" aria-hidden="true">→</span>
          </a>
          <h1 className="hero__title hero-reveal">
            One account.<br />
            <span className="hero__title-accent">Any app.</span>
          </h1>
          <p className="hero__subtitle hero-reveal">
            A passwordless identity that travels with you.
            Your profile and data follow you across every app you use —
            with no lock-in, ever.
          </p>
          <div className="hero-reveal">
            <HeroSignInButton />
          </div>
          <ul className="hero__trust hero-reveal" aria-label="Why Certified">
            <li><span className="hero__trust-check" aria-hidden="true">✓</span> Free</li>
            <li><span className="hero__trust-check" aria-hidden="true">✓</span> No passwords</li>
            <li><span className="hero__trust-check" aria-hidden="true">✓</span> No vendor lock-in</li>
          </ul>
        </div>
      </section>
      <WhatYouGet />
      <HowItWorks />
      <PartnerApps />
      <BuiltForTrust />
      <FaqSection />
      <ReadyCtaSection />
    </>
  );
}
