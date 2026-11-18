import { Avatar } from "@hypercerts-org/ui-react";
import Link from "next/link";
import { actorHref } from "@/components/cards";
import LpArrow from "@/components/landing/lp-arrow";
import { getActor } from "@/lib/hypercerts/queries";

/** Three profiles from the founding community, as on staging. */
const FEATURED = [
  {
    did: "did:plc:pktwukejt6bnubpkhldnaeyc", // bees-and-trees-uga.certified.one
    name: "Bees and Trees Uganda",
    tagline: "Environmental education with smallholder farmers in the Mt. Elgon region of Uganda.",
  },
  {
    did: "did:plc:7zu5w6ofrl6ha5ooykapptwe", // brave-earth-p3he.certified.one
    name: "Tierra Valiente (Brave Earth)",
    tagline: "Food sovereignty and community resilience in San Juan, Costa Rica.",
  },
  {
    did: "did:plc:uuvfp7xadcud56pjxbka26lc", // rifai-sicilia.certified.one
    name: "Rifai Sicilia",
    tagline: "Regenerating Sicilian ecology through bioregional commons development.",
  },
] as const;

/**
 * "See the work people are doing": the featured profiles, from the API
 * (cached, as every profile is), falling back to their names and lines
 * here when one can't be loaded.
 */
export default async function ExploreProfiles() {
  const profiles = await Promise.all(
    FEATURED.map(async (featured) => ({
      featured,
      actor: await getActor(featured.did).catch(() => null),
    })),
  );
  return (
    <section className="lp-section" aria-labelledby="lp-explore-title">
      <div className="lp-section__inner lp-split">
        <header className="lp-split__head">
          <span className="lp-eyebrow">Explore</span>
          <h2 id="lp-explore-title" className="lp-h2">
            See the work people are doing
          </h2>
          <p className="lp-split__lead">
            Browse projects, people, and organizations across the network. Our first communities
            work in ecological regeneration — the network is built for any impact domain.
          </p>
          <Link href="/explore" className="lp-link">
            Explore the network <LpArrow />
          </Link>
        </header>
        <div className="lp-split__body">
          {profiles.map(({ featured, actor }) => {
            const name = actor?.profile.displayName || featured.name;
            return (
              <Link
                key={featured.did}
                prefetch
                href={actor ? actorHref(actor) : actorHref(featured.did)}
                className="lp-explore__row"
              >
                <Avatar
                  name={name}
                  src={actor?.avatarUrl}
                  size="md"
                  className="lp-explore__avatar"
                />
                <span className="lp-explore__text">
                  <span className="lp-explore__name">{name}</span>
                  <span className="lp-explore__bio">{actor?.description || featured.tagline}</span>
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
