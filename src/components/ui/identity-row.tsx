import React from "react";
import Link from "next/link";
import Avatar from "./avatar";
import Skeleton from "./skeleton";
import { getInitials } from "@/lib/utils/initials";
import { accountName, isMachineHandle } from "@/lib/utils/identity";

export interface IdentityRowProps {
  /** Subject DID — used for the @handle fallback and initials. */
  did: string;
  /** Resolved handle (without leading @). */
  handle?: string;
  /** Display name; falls back to a handle a person chose, then
   *  "Unnamed account" (muted). Never a DID or a machine handle. */
  displayName?: string;
  /** Avatar image URL. */
  avatarUrl?: string;
  /** When set, the whole row becomes a link to this href. */
  href?: string;
  /** Secondary line under the name, in the muted style (e.g. "Third
   *  party"). None by default: lists show names, not handles. */
  subtitle?: string;
  /** Show `@handle` under the name (when the account has a name and a
   *  handle a person chose). Off by default; on where telling accounts
   *  apart matters, such as a group's member list or an account picker. */
  showHandle?: boolean;
  /** "sm" = compact row (lists inside a section), "md" = people row
   *  (full-page lists of accounts). @default "md" */
  size?: "sm" | "md";
  /** Render the skeleton placeholder instead of resolved content. */
  loading?: boolean;
  className?: string;
}

// The two account-row sizes (DESIGN.md §4, account rows):
//   sm = compact, for lists inside a page section: 32px avatar, 14px name,
//        12px secondary line;
//   md = people, for full-page lists of accounts: 40px avatar, 16px name,
//        13px secondary line.
const avatarSizeMap = { sm: "sm", md: "row" } as const;
const gapMap = { sm: "gap-3", md: "gap-3" } as const;
const nameSizeMap = { sm: "text-body-sm", md: "text-body" } as const;
const handleSizeMap = { sm: "text-caption", md: "text-ui" } as const;
const skelAvatarPx = { sm: 32, md: 40 } as const;

/**
 * Presentational avatar + name row (DESIGN.md §9.5).
 *
 * The primary line is the account's name (`accountName`: the display
 * name, else a handle a person chose, else a muted "Unnamed account").
 * The secondary line is `subtitle`, or `@handle` with `showHandle`. Built
 * on {@link Avatar} +
 * {@link Skeleton}; pass `href` to make the whole row a link.
 *
 * Canonical replacement for the hand-rolled byline rows
 * (activity-author, activity-contributor, endorsement-row).
 */
export default function IdentityRow({
  did,
  handle,
  displayName,
  avatarUrl,
  href,
  subtitle,
  showHandle = false,
  size = "md",
  loading = false,
  className = "",
}: IdentityRowProps) {
  const containerClass = `flex items-center ${gapMap[size]} min-w-0 ${className}`;

  if (loading) {
    return (
      <div className={containerClass} aria-hidden="true">
        <Skeleton variant="circle" width={skelAvatarPx[size]} />
        <div className="flex-1 min-w-0 space-y-1.5">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="60%" />
        </div>
      </div>
    );
  }

  const { name: primary, fallback } = accountName(displayName, handle, did);
  const readableHandle =
    !!handle && handle !== did && !handle.startsWith("did:") && !isMachineHandle(handle);
  // An explicit subtitle wins; the handle only on request, and only under
  // a name (never the same handle twice).
  const secondary =
    subtitle !== undefined
      ? subtitle
      : showHandle && readableHandle && displayName
        ? `@${handle}`
        : null;

  const inner = (
    <>
      <Avatar
        size={avatarSizeMap[size]}
        src={avatarUrl || undefined}
        alt=""
        fallbackInitials={getInitials(displayName, readableHandle ? handle : null)}
        seed={did}
      />
      <span className="flex flex-col min-w-0">
        <span
          className={`${nameSizeMap[size]} truncate ${
            fallback
              ? "font-normal text-[var(--fg-muted)]"
              : "font-medium text-[var(--fg-primary)]"
          }`}
        >
          {primary}
        </span>
        {secondary ? (
          <span
            className={`${handleSizeMap[size]} text-[var(--fg-muted)] truncate`}
          >
            {secondary}
          </span>
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`${containerClass} rounded transition-colors duration-fast hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]`}
      >
        {inner}
      </Link>
    );
  }

  return <div className={containerClass}>{inner}</div>;
}
