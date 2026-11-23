"use client";

import Link from "next/link";
import { useFollowerDelta } from "@/lib/write-overlay/use-follow";

const numberFormat = new Intl.NumberFormat("en");

/**
 * An account's followers and whom it follows, each leading to its tab. The
 * follower count includes this browser's follows and unfollows the index
 * doesn't show yet. Nothing when both are none.
 */
export function FollowCounts({
  did,
  base,
  followers: indexed,
  following,
}: {
  did: string;
  base: string;
  followers: number;
  following: number;
}) {
  const followers = Math.max(0, indexed + useFollowerDelta(did));
  if (followers === 0 && following === 0) return null;
  return (
    <p className="trust-counts">
      {followers > 0 && (
        <Link prefetch href={`${base}/followers`} className="trust-count">
          <strong>{numberFormat.format(followers)}</strong>
          {followers === 1 ? " follower" : " followers"}
        </Link>
      )}
      {followers > 0 && following > 0 && <span aria-hidden> · </span>}
      {following > 0 && (
        <Link prefetch href={`${base}/following`} className="trust-count">
          <strong>{numberFormat.format(following)}</strong> following
        </Link>
      )}
    </p>
  );
}
