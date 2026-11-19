"use client";

// The profile header's actions and tabs: the client-side pieces.
//
// Follow, Endorse and Add to list are placeholders until the Hypercerts SDK
// ships those writes: shown, so the page has its final shape, but disabled.

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
 * A visitor's actions: Follow (Following, when the account you act as
 * already does), Endorse, Share and More.
 */
export function VisitorActions({
  did,
  path,
  title,
  following,
}: {
  did: string;
  path: string;
  title: string;
  following: boolean;
}) {
  return (
    <>
      {following ? (
        <ComingSoonButton>
          <Check size={16} aria-hidden />
          Following
        </ComingSoonButton>
      ) : (
        <ComingSoonButton variant="primary">
          <UserPlus size={16} aria-hidden />
          Follow
        </ComingSoonButton>
      )}
      <ComingSoonButton>
        <ThumbsUp size={16} aria-hidden />
        Endorse
      </ComingSoonButton>
      <ShareButton path={path} title={title} />
      <Menu>
        <MenuTrigger asChild>
          <MenuButton label={`More actions for ${title}`} />
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
    [tab.href, ...(tab.also ?? [])].some((href) => href.toLowerCase() === pathname);
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
