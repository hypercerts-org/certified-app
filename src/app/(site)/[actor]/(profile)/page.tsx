import { ExpandableText, Heading, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileFeed, ProfileFeedSkeleton } from "@/components/profile-feed";
import { getActor, getActorCore, getProfileFeed } from "@/lib/hypercerts/queries";
import type { ActorCard } from "@/lib/hypercerts/views";
import { nameOf } from "@/lib/hypercerts/views";
import { getHandle } from "@/lib/identity";
import { pageMetadata, trimMetaDescription } from "@/lib/seo";

// The profile's Overview, the left column under the tabs: About (an
// organization's long description) as the first card, then the feed of what
// the account did, newest first. The figures and facts are in the right
// column (the layout's), and who endorsed and follows the account in the
// header, so nothing here repeats them.

export async function generateMetadata({ params }: PageProps<"/[actor]">): Promise<Metadata> {
  // The title needs the checked handle: on each visit, not in the cached page.
  await connection();
  const actor = await getActor(decodeURIComponent((await params).actor));
  if (!actor) return { title: "Not found", robots: { index: false } };
  const name = nameOf(actor);
  const slug = actor.handle ?? actor.did;
  const bio = actor.profile.description || actor.longDescription;
  const fallback = actor.handle
    ? `${name} (@${actor.handle}) on Certified — projects, activities, badges and endorsements.`
    : `${name} on Certified — projects, activities, badges and endorsements.`;
  return pageMetadata({
    title: actor.handle && name !== `@${actor.handle}` ? `${name} (@${actor.handle})` : name,
    description: trimMetaDescription(bio, fallback),
    path: `/${encodeURIComponent(slug)}`,
    image: actor.bannerUrl ?? actor.avatarUrl,
    card: actor.bannerUrl
      ? "summary_large_image"
      : actor.avatarUrl
        ? "summary"
        : "summary_large_image",
    type: "profile",
  });
}

/** The feed, and its owner's handle for the links in it: both at once. */
async function Feed({ owner }: { owner: ActorCard }) {
  await connection(); // per visit: not in the cached page (profile layout)
  const [initial, handle] = await Promise.all([getProfileFeed(owner.did), getHandle(owner.did)]);
  return <ProfileFeed owner={{ ...owner, handle }} initial={initial} />;
}

async function Overview({ params }: Pick<PageProps<"/[actor]">, "params">) {
  const actor = await getActorCore(decodeURIComponent((await params).actor));
  if (!actor) notFound();
  // The header's lead is the bio, so an organization's longer description
  // gets a card of its own.
  const about = actor.profile.description.trim() ? actor.longDescription : null;
  const owner: ActorCard = {
    did: actor.did,
    handle: null,
    displayName: actor.displayName,
    description: null,
    avatarUrl: actor.avatarUrl,
    isOrganization: actor.isOrganization,
  };
  return (
    <div className="profile-overview">
      {about && (
        <section className="about-card" aria-labelledby="about-heading">
          <Heading level={2} size="heading" id="about-heading">
            About
          </Heading>
          <ExpandableText lines={6} className="expandable-fade">
            <Text relaxed className="prewrap" dir="auto">
              {about}
            </Text>
          </ExpandableText>
        </section>
      )}
      <Suspense fallback={<ProfileFeedSkeleton />}>
        <Feed owner={owner} />
      </Suspense>
    </div>
  );
}

export default function ProfileOverviewPage(props: PageProps<"/[actor]">) {
  return (
    <Suspense fallback={<ProfileFeedSkeleton />}>
      <Overview params={props.params} />
    </Suspense>
  );
}
