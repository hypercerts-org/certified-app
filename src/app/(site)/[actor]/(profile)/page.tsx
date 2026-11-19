import { ExpandableText, Heading, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileFeed, ProfileFeedSkeleton } from "@/components/profile-feed";
import { getActor, getProfileFeed } from "@/lib/hypercerts/queries";
import type { ActorCard } from "@/lib/hypercerts/views";
import { profileActor } from "@/lib/profile-route";

// The profile's Overview, the left column under the tabs: About (an
// organization's long description) as the first card, then the feed of what
// the account did, newest first. The figures and facts are in the right
// column (the layout's), and who endorsed and follows the account in the
// header, so nothing here repeats them.

export async function generateMetadata({ params }: PageProps<"/[actor]">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor?.displayName ?? "Not found" };
}

async function Feed({ owner }: { owner: ActorCard }) {
  const initial = await getProfileFeed(owner.did);
  return <ProfileFeed owner={owner} initial={initial} />;
}

async function Overview({ params }: Pick<PageProps<"/[actor]">, "params">) {
  const { actor } = await profileActor(params, "");
  // The header's lead is the bio, so an organization's longer description
  // gets a card of its own.
  const about = actor.profile.description.trim() ? actor.longDescription : null;
  const owner: ActorCard = {
    did: actor.did,
    handle: actor.handle,
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
