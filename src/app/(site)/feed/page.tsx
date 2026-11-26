import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { type FeedViewer, NetworkFeed } from "@/components/network-feed";
import { getActingAs } from "@/lib/acting-as";
import { getUser } from "@/lib/auth/dal";
import { DEFAULT_ORG_QUALITY, type NetworkFeedEntry } from "@/lib/feed-grouping";
import type { Page } from "@/lib/hypercerts/views";
import { logError } from "@/lib/log";
import { signInHref } from "@/lib/validate";
import { getNetworkFeed, getTrustedEvaluators } from "@/lib/views-service";

// The network feed. The page renders its frame at once and hands the client
// three promises it waits on where they are shown: the viewer (the header's
// line), the trusted endorsers (the filters' list) and the first page (the
// feed), each behind its own skeleton. Nothing here is awaited at the top.

export const metadata: Metadata = {
  title: "Feed",
  robots: { index: false },
};

/** The signed-in account, or the group it acts as; null when signed out or unreadable. */
async function loadViewer(): Promise<FeedViewer | null> {
  // At request time only: the page itself is prerendered, this is per viewer.
  await connection();
  try {
    const user = await getUser();
    if (!user) return null;
    const viewerDid = (await getActingAs()) ?? user.did;
    return { viewerDid, asGroup: viewerDid !== user.did };
  } catch (err) {
    unstable_rethrow(err);
    logError("[feed] viewer failed", err);
    return null;
  }
}

/** The first page for the default filters; null when the service fails (the client retries). */
async function loadFirstPage(
  viewer: Promise<FeedViewer | null>,
): Promise<Page<NetworkFeedEntry> | null> {
  const v = await viewer;
  if (!v) return null;
  try {
    const evaluators = await getTrustedEvaluators();
    return await getNetworkFeed({
      viewerDid: v.viewerDid,
      trustedEvaluators: evaluators.map((e) => e.did),
      organizationQuality: DEFAULT_ORG_QUALITY,
    });
  } catch (err) {
    unstable_rethrow(err);
    logError("[feed] initial feed load failed", err, { viewerDid: v.viewerDid });
    return null;
  }
}

/** Sends a signed-out visitor to sign in; renders nothing. */
async function SignedInOnly() {
  if (!(await getUser())) redirect(signInHref("/feed"));
  return null;
}

export default function FeedPage() {
  const viewer = loadViewer();
  return (
    <>
      <Suspense fallback={null}>
        <SignedInOnly />
      </Suspense>
      <NetworkFeed
        viewer={viewer}
        evaluators={getTrustedEvaluators()}
        firstPage={loadFirstPage(viewer)}
      />
    </>
  );
}
