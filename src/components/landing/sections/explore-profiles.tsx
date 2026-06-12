import Link from "next/link";
import Avatar from "@/components/ui/avatar";
import LpArrow from "@/components/landing/lp-arrow";
import { profileUrl } from "@/lib/urls";
import type { ResolvedProfilePayload } from "@/app/api/resolve-did/resolve-core";
import type { CuratedProfile } from "@/lib/constants/curated-profiles";

export interface FeaturedProfile {
  curated: CuratedProfile;
  resolved: ResolvedProfilePayload | null;
}

/**
 * "Explore" — three real profiles from the network as hairline-divided
 * rows. Resolution happens server-side in landing-page.tsx (ISR);
 * every field degrades to the curated fallback so a failed resolve
 * still renders a complete row.
 */
export default function ExploreProfiles({ profiles }: { profiles: FeaturedProfile[] }) {
  return (
    <section className="lp-section" aria-labelledby="lp-explore-title">
      <div className="lp-section__inner lp-split">
        <header className="lp-split__head">
          <span className="lp-eyebrow">Explore</span>
          <h2 id="lp-explore-title" className="lp-h2">
            See what people are building
          </h2>
          <p className="lp-split__lead">
            Browse projects, people, and organizations across the network.
            Follow the ones you care about.
          </p>
          <Link href="/explore" className="lp-link">
            Explore the network <LpArrow />
          </Link>
        </header>
        <div className="lp-split__body">
          {profiles.map(({ curated, resolved }) => {
            const name = resolved?.displayName || curated.fallbackName;
            const bio = resolved?.description || curated.tagline;
            // Handle when resolved; DID when not — handles can be
            // renamed, DIDs are durable, and the [actor] route takes
            // both.
            const actor = resolved?.handle || curated.did;
            return (
              <Link
                key={curated.did}
                href={profileUrl(actor)}
                className="lp-explore__row"
              >
                <Avatar
                  src={resolved?.avatar ?? undefined}
                  alt=""
                  size="md"
                  fallbackInitials={name}
                  className="lp-explore__avatar"
                />
                <span className="lp-explore__text">
                  <span className="lp-explore__name">{name}</span>
                  <span className="lp-explore__bio">{bio}</span>
                </span>
                <LpArrow className="lp-explore__arrow" />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
