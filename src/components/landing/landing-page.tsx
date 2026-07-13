import LandingTopBar from "@/components/landing/landing-topbar";
import Hero from "@/components/landing/sections/hero";
import WhatLivesHere from "@/components/landing/sections/what-lives-here";
import MayaWalkthrough from "@/components/landing/sections/maya-walkthrough";
import PartnerApps from "@/components/landing/sections/partner-apps";
import ExploreProfiles, {
  type FeaturedProfile,
} from "@/components/landing/sections/explore-profiles";
import NetworkStats from "@/components/landing/sections/network-stats";
import Trust from "@/components/landing/sections/trust";
import AiWorld from "@/components/landing/sections/ai-world";
import OrganizationsStrip from "@/components/landing/sections/organizations-strip";
import FaqSection from "@/components/landing/sections/faq-content";
import ClosingCta from "@/components/landing/sections/closing-cta";
import { CURATED_PROFILES } from "@/lib/constants/curated-profiles";
import { buildProfilePayload } from "@/app/api/resolve-did/resolve-core";
import { fetchNetworkCountsServer } from "@/lib/atproto/network-counts-server";

/**
 * The /welcome landing page. Server component: resolves the three
 * featured profiles for the Explore section AND the five network
 * counts for the stats strip at render time (the page is ISR'd — see
 * `revalidate` in src/app/welcome/page.tsx), so both sections ship
 * real network content with zero client fetches. Both helpers
 * swallow their own failures; the extra catches guard the page
 * against anything unexpected so a dead indexer or PDS can never
 * take the landing page down.
 */
export default async function LandingPage() {
  const [profiles, counts] = await Promise.all([
    Promise.all(
      CURATED_PROFILES.map(
        async (curated): Promise<FeaturedProfile> => {
          try {
            return {
              curated,
              resolved: await buildProfilePayload(curated.did),
            };
          } catch {
            return { curated, resolved: null };
          }
        },
      ),
    ),
    fetchNetworkCountsServer().catch(() => null),
  ]);

  return (
    <div className="lp">
      <LandingTopBar />
      <Hero />
      <WhatLivesHere />
      <MayaWalkthrough />
      <AiWorld />
      <PartnerApps />
      <ExploreProfiles profiles={profiles} />
      <NetworkStats initialCounts={counts} />
      <Trust />
      <OrganizationsStrip />
      <FaqSection />
      <ClosingCta />
    </div>
  );
}
