import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { NetworkFeed } from "@/components/network-feed";
import { PageHeader } from "@/components/page-title";
import { ProfileFeedSkeleton } from "@/components/profile-feed";
import { getActingAs } from "@/lib/acting-as";
import { getUser } from "@/lib/auth/dal";
import { DEFAULT_ORG_QUALITY, type NetworkFeedEntry } from "@/lib/feed-grouping";
import type { Page } from "@/lib/hypercerts/views";
import { logError } from "@/lib/log";
import { signInHref } from "@/lib/validate";
import { getNetworkFeed, getTrustedEvaluators } from "@/lib/views-service";

export const metadata: Metadata = {
  title: "Feed",
  robots: { index: false },
};

async function FeedContent() {
  const user = await getUser();
  if (!user) redirect(signInHref("/feed"));

  const actingAs = await getActingAs();
  const viewerDid = actingAs ?? user.did;
  const asGroup = viewerDid !== user.did;

  const evaluators = await getTrustedEvaluators();
  let initial: Page<NetworkFeedEntry> | null = null;
  let initialFailed = false;

  try {
    initial = await getNetworkFeed({
      viewerDid,
      trustedEvaluators: evaluators.map((e) => e.did),
      organizationQuality: DEFAULT_ORG_QUALITY,
    });
  } catch (err) {
    unstable_rethrow(err);
    logError("[feed] initial feed load failed", err, { viewerDid });
    initialFailed = true;
  }

  return (
    <NetworkFeed
      key={viewerDid}
      viewerDid={viewerDid}
      asGroup={asGroup}
      evaluators={evaluators}
      initial={initial}
      initialFailed={initialFailed}
    />
  );
}

function FeedShell() {
  return (
    <div className="page feed-page">
      <PageHeader
        title="Feed"
        description="New activities, projects, updates and endorsements from accounts you follow and your trusted endorsers."
      />
      <div className="feed-layout">
        <div className="feed-main">
          <ProfileFeedSkeleton />
        </div>
      </div>
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedShell />}>
      <FeedContent />
    </Suspense>
  );
}
