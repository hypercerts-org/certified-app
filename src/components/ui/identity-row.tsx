import React from "react";
import Link from "next/link";
import Avatar from "./avatar";
import Skeleton from "./skeleton";
import { getInitials } from "@/lib/utils/initials";
import { truncateDid } from "@/lib/utils/did";

export interface IdentityRowProps {
  /** Subject DID — used for the @handle fallback and initials. */
  did: string;
  /** Resolved handle (without leading @). */
  handle?: string;
  /** Display name; falls back to handle, then truncated DID. */
  displayName?: string;
  /** Avatar image URL. */
  avatarUrl?: string;
  /** When set, the whole row becomes a link to this href. */
  href?: string;
  /** @default "md" */
  size?: "sm" | "md";
  /** Render the skeleton placeholder instead of resolved content. */
  loading?: boolean;
  className?: string;
}

const avatarSizeMap = { sm: "sm", md: "md" } as const;
const gapMap = { sm: "gap-2", md: "gap-3" } as const;
const nameSizeMap = { sm: "text-body-sm", md: "text-body" } as const;
const skelAvatarPx = { sm: 32, md: 48 } as const;

/**
 * Presentational avatar + name + @handle row.
 *
 * Resolution order for the primary line is displayName → handle →
 * truncateDid(did); the secondary line shows `@handle` only when a real
 * handle (distinct from the DID) is present. Built on {@link Avatar} +
 * {@link Skeleton}; pass `href` to make the whole row a link.
 *
 * Canonical replacement for the four hand-rolled byline rows
 * (activity-author, activity-contributor, endorsement-row,
 * notification-row).
 */
export default function IdentityRow({
  did,
  handle,
  displayName,
  avatarUrl,
  href,
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

  const hasHandle = !!handle && handle !== did;
  const primary = displayName || handle || truncateDid(did);

  const inner = (
    <>
      <Avatar
        size={avatarSizeMap[size]}
        src={avatarUrl || undefined}
        alt=""
        fallbackInitials={getInitials(displayName, did)}
      />
      <span className="flex flex-col min-w-0">
        <span
          className={`${nameSizeMap[size]} font-medium text-[var(--fg-primary)] truncate`}
        >
          {primary}
        </span>
        {hasHandle ? (
          <span className="text-body-sm text-[var(--fg-muted)] truncate">
            @{handle}
          </span>
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`${containerClass} rounded transition-colors duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]`}
      >
        {inner}
      </Link>
    );
  }

  return <div className={containerClass}>{inner}</div>;
}
