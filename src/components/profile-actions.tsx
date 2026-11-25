"use client";

// The profile header's actions and tabs: the client-side pieces.
//
// Add to list is a placeholder until the Hypercerts SDK ships list writes:
// shown, so the page has its final shape, but disabled.

import {
  Button,
  Menu,
  MenuButton,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@hypercerts-org/ui-react";
import { Check, Copy, Link2, ListPlus, Pencil, ThumbsUp, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { COMING_SOON } from "@/components/coming-soon";
import { LinkPending } from "@/components/link-pending";
import * as endorsementActions from "@/lib/hypercerts/endorsement-actions";
import * as followActions from "@/lib/hypercerts/follow-actions";
import type { EndorsementRef, FollowRef } from "@/lib/hypercerts/views";

/** Copies `text`, and says so (or that it failed) in a toast. */
async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast.error(`${what} couldn't be copied`);
  }
}

/**
 * Shares the profile's address: the system share sheet where there is one
 * (phones), otherwise a copy to the clipboard.
 */
export function ShareButton({ path, title }: { path: string; title: string }) {
  const share = async () => {
    const url = new URL(path, window.location.origin).href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Closing the share sheet rejects too: nothing to report.
      }
      return;
    }
    await copy(url, "Profile link");
  };
  return (
    <Button variant="secondary" size="sm" onClick={share}>
      <Link2 size={16} aria-hidden />
      Share
    </Button>
  );
}

/** The action's answer was lost: the change may or may not have been made. */
const lost = (action: "follow" | "unfollow" | "endorse" | "unendorse") =>
  ({
    ok: false,
    message:
      action === "unendorse"
        ? "We couldn't confirm revoking the endorsement. Reload to check."
        : `We couldn't confirm the ${action === "endorse" ? "endorsement" : action}. Reload to check.`,
  }) as const;

/**
 * Follow, or Following (a click unfollows), as the account you act as:
 * `subject` is an account's DID or a project's URI. The
 * click shows the new state at once; the action returns with the page
 * refreshed from the index, which then shows it. If the index was slower than
 * the action waited, the button keeps what was written until the page shows
 * something new.
 */
function FollowButton({
  repo,
  subject,
  rendered,
}: {
  repo: string;
  subject: string;
  rendered: FollowRef | null;
}) {
  const [written, setWritten] = useState<{
    follow: FollowRef | null;
    over: FollowRef | null;
  } | null>(null);
  // Kept only while the page still shows what it showed when it was written.
  const current = written && written.over?.uri === rendered?.uri ? written.follow : rendered;
  const [following, setFollowing] = useOptimistic(current !== null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (pending) return;
    const next = !following;
    startTransition(async () => {
      setFollowing(next);
      const result = next
        ? await followActions.follow({ repo, subject }).catch(() => lost("follow"))
        : await followActions
            .unfollow({ repo, subject, uris: current ? [current.uri] : [] })
            .catch(() => lost("unfollow"));
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (!result.indexed) {
        startTransition(() => setWritten({ follow: result.follow, over: rendered }));
      }
    });
  };

  return following ? (
    <Button variant="secondary" size="sm" onClick={toggle} title="Unfollow">
      <Check size={16} aria-hidden />
      Following
    </Button>
  ) : (
    <Button variant="primary" size="sm" onClick={toggle}>
      <UserPlus size={16} aria-hidden />
      Follow
    </Button>
  );
}

/**
 * Follow for whoever visits: as `actor`, the account they act as, with its
 * `follow` of `subject` if any; signed out (`actor` null), it leads to
 * signing in and back to `path`.
 */
export function FollowControl({
  subject,
  path,
  actor,
  follow,
}: {
  subject: string;
  path: string;
  actor: string | null;
  follow: FollowRef | null;
}) {
  if (actor) return <FollowButton key={actor} repo={actor} subject={subject} rendered={follow} />;
  return (
    <Button
      href={`/sign-in?${new URLSearchParams({ returnTo: path })}`}
      variant="primary"
      size="sm"
    >
      <UserPlus size={16} aria-hidden />
      Follow
    </Button>
  );
}

/**
 * Endorse, or Endorsed (a click revokes), as the account you act as. Mirrors
 * FollowButton: optimistic on click, refreshed from the index on return, and
 * holds what was written if the index is slower than the action's wait.
 */
function EndorseButton({
  repo,
  subject,
  rendered,
}: {
  repo: string;
  subject: string;
  rendered: EndorsementRef | null;
}) {
  const [written, setWritten] = useState<{
    endorsement: EndorsementRef | null;
    over: EndorsementRef | null;
  } | null>(null);
  // Kept only while the page still shows what it showed when it was written.
  const current = written && written.over?.uri === rendered?.uri ? written.endorsement : rendered;
  const [endorsed, setEndorsed] = useOptimistic(current !== null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (pending) return;
    const next = !endorsed;
    startTransition(async () => {
      setEndorsed(next);
      const result = next
        ? await endorsementActions.endorse({ repo, subject }).catch(() => lost("endorse"))
        : await endorsementActions
            .unendorse({ repo, subject, uris: current ? [current.uri] : [] })
            .catch(() => lost("unendorse"));
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (!result.indexed) {
        startTransition(() => setWritten({ endorsement: result.endorsement, over: rendered }));
      }
    });
  };

  return endorsed ? (
    <Button variant="secondary" size="sm" pressed onClick={toggle} title="Revoke endorsement">
      <Check size={16} aria-hidden />
      Endorsed
    </Button>
  ) : (
    <Button variant="secondary" size="sm" onClick={toggle}>
      <ThumbsUp size={16} aria-hidden />
      Endorse
    </Button>
  );
}

/**
 * Endorse for whoever visits: as `actor`, the account they act as, with its
 * plain `endorsement` of `subject` if any; signed out (`actor` null), it leads
 * to signing in and back to `path`.
 */
export function EndorseControl({
  subject,
  path,
  actor,
  endorsement,
}: {
  subject: string;
  path: string;
  actor: string | null;
  endorsement: EndorsementRef | null;
}) {
  if (actor)
    return <EndorseButton key={actor} repo={actor} subject={subject} rendered={endorsement} />;
  return (
    <Button
      href={`/sign-in?${new URLSearchParams({ returnTo: path })}`}
      variant="secondary"
      size="sm"
    >
      <ThumbsUp size={16} aria-hidden />
      Endorse
    </Button>
  );
}

/**
 * A visitor's actions: Follow and Endorse (signed out, each leads to signing
 * in), Share and More. `actor` is the account the visitor acts as, `follow`
 * and `endorsement` its records for this account, if any.
 */
export function VisitorActions({
  did,
  path,
  title,
  actor,
  follow,
  endorsement,
}: {
  did: string;
  path: string;
  title: string;
  actor: string | null;
  follow: FollowRef | null;
  endorsement: EndorsementRef | null;
}) {
  return (
    <>
      <FollowControl subject={did} path={path} actor={actor} follow={follow} />
      <EndorseControl subject={did} path={path} actor={actor} endorsement={endorsement} />
      <ShareButton path={path} title={title} />
      <Menu>
        <MenuTrigger asChild>
          {/* The full name for screen readers; on hover, a tooltip short enough
              not to run past the page's edge (it centers on the button). */}
          <MenuButton label={`More actions for ${title}`} tooltip="More actions" />
        </MenuTrigger>
        <MenuContent label="More actions" align="end">
          <MenuItem disabled title={COMING_SOON}>
            <ListPlus size={16} aria-hidden />
            Add to list
          </MenuItem>
          <MenuItem onClick={() => void copy(did, "Permanent ID")}>
            <Copy size={16} aria-hidden />
            Copy Permanent ID
          </MenuItem>
        </MenuContent>
      </Menu>
    </>
  );
}

/**
 * The account's own actions, for whoever acts as it: Edit profile (when they
 * may edit it: `editHref`, else null) and Share.
 */
export function OwnerActions({
  editHref,
  path,
  title,
}: {
  editHref: string | null;
  path: string;
  title: string;
}) {
  return (
    <>
      {editHref && (
        <Button href={editHref} variant="secondary" size="sm">
          <Pencil size={16} aria-hidden />
          Edit profile
        </Button>
      )}
      <ShareButton path={path} title={title} />
    </>
  );
}

export type ProfileTab = {
  label: string;
  href: string;
  count?: string;
  /** Other paths this tab is current on (Following under Followers). */
  also?: string[];
  /** Known to be empty: left out, unless it is the page open. */
  empty?: boolean;
  /** Also current on the pages below it (a list under Lists). */
  nested?: boolean;
};

/**
 * Links styled as tabs, each its own URL, so they are navigation
 * (aria-current), not an in-page tab list: the profile's pages, and
 * (`variant="segmented"`) the two lists within one (Followers / Following).
 */
export function ProfileTabs({
  label,
  tabs,
  variant = "tabs",
}: {
  label: string;
  tabs: ProfileTab[];
  variant?: "tabs" | "segmented";
}) {
  const pathname = decodeURIComponent(usePathname()).toLowerCase();
  const current = (tab: ProfileTab) =>
    [tab.href, ...(tab.also ?? [])].some((href) => href.toLowerCase() === pathname) ||
    Boolean(tab.nested && pathname.startsWith(`${tab.href.toLowerCase()}/`));
  const nav = useRef<HTMLElement>(null);
  // On a narrow screen the row scrolls sideways: keep the current tab in view
  // (opened from a link, a tab further along would be off-screen).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the page changes
  useEffect(() => {
    const row = nav.current;
    const tab = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    const start =
      tab.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
    const end = start + tab.offsetWidth;
    if (start < row.scrollLeft) row.scrollLeft = start;
    else if (end > row.scrollLeft + row.clientWidth) row.scrollLeft = end - row.clientWidth;
  }, [pathname]);
  return (
    <nav
      ref={nav}
      aria-label={label}
      className={variant === "tabs" ? "profile-tabs" : "segmented-links"}
    >
      {tabs
        .filter((tab) => !tab.empty || current(tab))
        .map((tab) => (
          <Link
            prefetch
            key={tab.href}
            href={tab.href}
            className={variant === "tabs" ? "profile-tab" : "segmented-link"}
            aria-current={current(tab) ? "page" : undefined}
          >
            {tab.label}
            {tab.count !== undefined && <span className="profile-tab-count">{tab.count}</span>}
            <LinkPending />
          </Link>
        ))}
    </nav>
  );
}

/**
 * Segmented links while their page loads: the same control, with the labels
 * (the current one marked) but no links yet, so it doesn't move or flicker.
 */
export function SegmentedLinksSkeleton({ labels, current }: { labels: string[]; current: string }) {
  return (
    <div className="segmented-links" aria-hidden>
      {labels.map((label) => (
        <span
          key={label}
          className="segmented-link"
          aria-current={label === current ? "page" : undefined}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/** Tabs while their links load: the labels in place, no links yet. */
export function ProfileTabsSkeleton({ labels }: { labels: string[] }) {
  return (
    <div className="profile-tabs" aria-hidden>
      {labels.map((label) => (
        <span key={label} className="profile-tab">
          {label}
        </span>
      ))}
    </div>
  );
}
