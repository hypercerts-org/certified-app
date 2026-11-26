import { Suspense } from "react";
import AiWorld from "@/components/landing/ai-world";
import ClosingCta from "@/components/landing/closing-cta";
import ExploreProfiles from "@/components/landing/explore-profiles";
import FaqSection from "@/components/landing/faq-content";
import Hero from "@/components/landing/hero";
import LandingTopBar from "@/components/landing/landing-topbar";
import MayaWalkthrough from "@/components/landing/maya-walkthrough";
import NetworkStats from "@/components/landing/network-stats";
import OrganizationsStrip from "@/components/landing/organizations-strip";
import PartnerApps from "@/components/landing/partner-apps";
import Trust from "@/components/landing/trust";
import WhatLivesHere from "@/components/landing/what-lives-here";
import { SiteFooter } from "@/components/site-footer";
import { pageMetadata } from "@/lib/seo";
import "../landing.css";

const TITLE = "Certified — One account. Your work. Recognized everywhere.";
const DESCRIPTION =
  "Your profile, your work, and your supporters in one account — recognized on every app in the network, independent of any single platform.";

export const metadata = pageMetadata({
  absoluteTitle: TITLE,
  description: DESCRIPTION,
  path: "/welcome",
});

// The landing page for visitors who aren't signed in, after staging's
// /welcome: the same sections and copy (components/landing, styles in
// landing.css), on v2's data. It's the same for everyone and cached; the
// featured profiles and network counts come from the API, cached, each
// behind its own boundary so the page never waits for them. Only the top
// bar's button depends on who is viewing.
export default function WelcomePage() {
  return (
    <div className="lp">
      <LandingTopBar />
      <Hero />
      <WhatLivesHere />
      <MayaWalkthrough />
      <AiWorld />
      <PartnerApps />
      <Suspense fallback={null}>
        <ExploreProfiles />
      </Suspense>
      <Suspense fallback={null}>
        <NetworkStats />
      </Suspense>
      <Trust />
      <OrganizationsStrip />
      <FaqSection />
      <ClosingCta />
      <SiteFooter variant="landing" />
    </div>
  );
}
