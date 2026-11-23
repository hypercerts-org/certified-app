"use client";

// The profile header's actions and tabs: the client-side pieces.
//
// Endorse and Add to list are placeholders until the Hypercerts SDK ships
// those writes: shown, so the page has its final shape, but disabled.

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
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { COMING_SOON, ComingSoonButton } from "@/components/coming-soon";
import { LinkPending } from "@/components/link-pending";
import type { FollowRef } from "@/lib/hypercerts/views";
import { useFollow } from "@/lib/write-overlay/use-follow";

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

/**
 * Follow, or Following (a click unfollows), as the account you act as. The
 * change shows at once; see useFollow.
 */
function FollowButton({
  actor,
  subject,
  rendered,
}: {
  actor: string;
  subject: string;
  rendered: FollowRef | null;
}) {
  const { following, toggle } = useFollow(actor, subject, rendered);
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
 * A visitor's actions: Follow (signed out, it leads to signing in), Endorse,
 * Share and More. `actor` is the account the visitor acts as, `follow` its
 * follow of this one, if any.
 */
export function VisitorActions({
  did,
  path,
  title,
  actor,
  follow,
}: {
  did: string;
  path: string;
  title: string;
  actor: string | null;
  follow: FollowRef | null;
}) {
  return (
    <>
      {actor ? (
        <FollowButton actor={actor} subject={did} rendered={follow} />
      ) : (
        <Button
          href={`/sign-in?${new URLSearchParams({ returnTo: path })}`}
          variant="primary"
          size="sm"
        >
          <UserPlus size={16} aria-hidden />
          Follow
        </Button>
      )}
      <ComingSoonButton>
        <ThumbsUp size={16} aria-hidden />
        Endorse
      </ComingSoonButton>
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
