"use client"

import WhatYouGet from "@/components/landing/sections/what-you-get"
import NetworkStats from "@/components/landing/sections/network-stats"
import HowItWorks from "@/components/landing/sections/how-it-works"
import BuiltForTrust from "@/components/landing/sections/built-for-trust"
import ReadyCtaSection from "@/components/landing/sections/ready-cta-content"
import HeroSignInButton from "@/components/landing/hero-signin-button"
import { useProfileNavbar } from "@/lib/navbar-context"

/**
 * Landing page for /welcome. Sections, in order:
 *
 *   1. Hero — single-line positioning + sign-in CTA.
 *   2. WhatYouGet — 4-tile bento that surfaces certs / endorsements /
 *      projects / atproto-native portability (the four pillars of
 *      the positioning-redesign).
 *   3. NetworkStats — live counts pulled from the indexer (Users /
 *      Organizations / Certs / Projects / Endorsements). Endorsements
 *      carries a NEW badge — it's the newest of the five and the
 *      headline feature of this branch.
 *   4. HowItWorks — four-step walkthrough (create profile → mint
 *      certs → endorse → organize into projects).
 *   5. BuiltForTrust — four trust signals (open protocol, your
 *      records / your repo, leave anytime, endorsements with
 *      consent).
 *   6. ReadyCtaSection — closing CTA back to sign-in.
 */
export default function LandingPage() {
  // Opt the welcome page into the fullbleed app-shell — without
  // this the global `.app-shell__content` caps at 600px on desktop
  // and the hero / bento / stats grids render in a mobile-shaped
  // column at every viewport size. Same hook the profile pages
  // use for the wider GitHub-style layout.
  useProfileNavbar()

  return (
    <>
      <section className="hero hero--landing">
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
            Show your work.
            <br />
            <span className="hero__title-accent">
              Earn the trust to back it up.
            </span>
          </h1>
          <p className="hero__subtitle hero-reveal">
            A portable profile for what you&rsquo;ve done, the people who vouch for it, and the projects you ship — on an open protocol you don&rsquo;t need permission to leave.
          </p>
          <div className="hero-reveal">
            <HeroSignInButton />
          </div>
        </div>
      </section>
      <WhatYouGet />
      <NetworkStats />
      <HowItWorks />
      <BuiltForTrust />
      <ReadyCtaSection />
    </>
  )
}
