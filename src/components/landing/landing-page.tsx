import WhatYouGet from "@/components/landing/sections/what-you-get";
import HowItWorks from "@/components/landing/sections/how-it-works";
import PartnerApps from "@/components/landing/sections/partner-apps";
import BuiltForTrust from "@/components/landing/sections/built-for-trust";
import FaqSection from "@/components/landing/sections/faq-content";
import ReadyCtaSection from "@/components/landing/sections/ready-cta-content";
import HeroActions from "@/components/landing/hero-actions";
import HeroDiagram from "@/components/landing/hero-diagram";
import ChopSeal from "@/components/landing/chop-seal";
import { Shield, Lock, User } from "lucide-react";

/**
 * Landing page — editorial parchment-and-vermillion design.
 *
 * The hero is a 12-col split: an editorial typography block on the left
 * (vertical rail + chop seal + eyebrow + serif headline with italic red
 * emphasis + sub + dual buttons + AT Protocol footnote) and a hand-built
 * identity diagram on the right (centre card, six partner apps, dotted
 * connectors, watercolor blob, and an "AT / Protocol" badge).
 *
 * A pillared trust strip (01 Protect · 02 Connect · 03 Can choose) sits
 * just below the hero as a closing beat. Everything below that retains
 * the existing section rhythm but harmonized to the warm cream palette.
 */
export default function LandingPage() {
  return (
    <>
      <section className="hero hero--landing">
        {/* Faint paper-grid texture, dialed way back */}
        <div className="hero__pattern" aria-hidden="true">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="hero__split">
          {/* LEFT — editorial typography */}
          <div className="hero__copy">
            {/* Vertical rail on the far-left edge */}
            <aside className="hero__rail" aria-hidden="true">
              <span className="hero__rail-text">Your identity, your choice.</span>
              <span className="hero__rail-seal">
                <ChopSeal />
              </span>
            </aside>

            <div className="hero__copy-inner">
              <span className="hero__eyebrow">The universal identity</span>
              <h1 className="hero__title">
                Portable<br />
                identity<br />
                for the<br />
                <span className="hero__title-accent">atmosphere</span>.
              </h1>
              <p className="hero__subtitle">
                One secure account. Sign in anywhere.
                <br />
                Your identity, your data, your control.
              </p>

              <HeroActions />

              <p className="hero__footnote">
                <span className="hero__footnote-mark" aria-hidden="true">@</span>
                <span>Built on AT Protocol.</span>
                <a className="hero__footnote-link" href="#built-for-trust">
                  Learn more <span aria-hidden="true">→</span>
                </a>
              </p>
            </div>
          </div>

          {/* RIGHT — identity diagram */}
          <div className="hero__visual">
            <HeroDiagram />
            <aside className="hero__rail hero__rail--right" aria-hidden="true">
              <span className="hero__rail-eyebrow">OPEN WEB</span>
              <span className="hero__rail-redseal" />
              <span className="hero__rail-text hero__rail-text--right">Open web</span>
            </aside>
          </div>
        </div>

        {/* Three-pillar trust strip pinned under the hero */}
        <div className="hero-pillars" aria-label="What Certified gives you">
          <div className="hero-pillars__inner">
            <article className="hero-pillar">
              <div className="hero-pillar__icon" aria-hidden="true">
                <Shield size={24} strokeWidth={1.4} />
              </div>
              <span className="hero-pillar__num">01</span>
              <div className="hero-pillar__body">
                <h3>Protect</h3>
                <p className="hero-pillar__lede">Secure by design</p>
                <p>End-to-end encryption and user-controlled data.</p>
              </div>
            </article>
            <article className="hero-pillar">
              <div className="hero-pillar__icon" aria-hidden="true">
                <Lock size={24} strokeWidth={1.4} />
              </div>
              <span className="hero-pillar__num">02</span>
              <div className="hero-pillar__body">
                <h3>Connect</h3>
                <p className="hero-pillar__lede">One sign-in, everywhere</p>
                <p>Use your identity across apps built on the open web.</p>
              </div>
            </article>
            <article className="hero-pillar">
              <div className="hero-pillar__icon" aria-hidden="true">
                <User size={24} strokeWidth={1.4} />
              </div>
              <span className="hero-pillar__num">03</span>
              <div className="hero-pillar__body">
                <h3>Can choose</h3>
                <p className="hero-pillar__lede">You&apos;re in control</p>
                <p>Share only what you choose. Revoke access anytime.</p>
              </div>
            </article>
          </div>
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
