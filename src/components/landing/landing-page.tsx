import Hero from "@/components/landing/sections/hero";
import WhatLivesHere from "@/components/landing/sections/what-lives-here";
import MayaWalkthrough from "@/components/landing/sections/maya-walkthrough";
import PartnerApps from "@/components/landing/sections/partner-apps";
import ExploreProfiles, {
  type FeaturedProfile,
} from "@/components/landing/sections/explore-profiles";
import NetworkStats from "@/components/landing/sections/network-stats";
import Trust from "@/components/landing/sections/trust";
import OrganizationsStrip from "@/components/landing/sections/organizations-strip";
import FaqSection from "@/components/landing/sections/faq-content";
import ClosingCta from "@/components/landing/sections/closing-cta";
import { CURATED_PROFILES } from "@/lib/constants/curated-profiles";
import { buildProfilePayload } from "@/app/api/resolve-did/resolve-core";

/**
 * The /welcome landing page. Server component: resolves the three
 * featured profiles for the Explore section at render time (the page
 * is ISR'd — see `revalidate` in src/app/welcome/page.tsx), so the
 * section ships real network content with zero client fetches.
 * buildProfilePayload swallows its own failures; the extra catch
 * guards the page against anything unexpected so a dead indexer or
 * PDS can never take the landing page down.
 */
export default async function LandingPage() {
  const profiles: FeaturedProfile[] = await Promise.all(
    CURATED_PROFILES.map(async (curated) => {
      try {
        return { curated, resolved: await buildProfilePayload(curated.did) };
      } catch {
        return { curated, resolved: null };
      }
    }),
  );

  return (
    <div className="lp">
      <Hero />
      <WhatLivesHere />
      <MayaWalkthrough />
      <PartnerApps />
      <ExploreProfiles profiles={profiles} />
      <NetworkStats />
      <Trust />
      <OrganizationsStrip />
      <FaqSection />
      <ClosingCta />
    </div>
  );
}
