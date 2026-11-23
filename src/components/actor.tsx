// An account, wherever the app shows one: its name (ActorName), its picture
// (ActorAvatar), or both as a row (ActorRow). Every account goes through
// these, so an account reads and looks the same everywhere: its profile name,
// else its handle, else its DID (nameOf); its picture, else the initials of
// that name on an opaque disc; a square for an organization.

import { Avatar } from "@hypercerts-org/ui-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { type ActorCard, nameOf } from "@/lib/hypercerts/views";

/**
 * What these need of an account: an ActorCard, or as much of one as a caller
 * has. Without a DID it is someone named but without an account (an
 * activity's contributor given by name).
 */
export type ActorLike = Pick<ActorCard, "handle" | "displayName" | "avatarUrl"> & {
  did?: string;
  isOrganization?: boolean;
};

export function ActorName({ actor, className }: { actor: ActorLike; className?: string }) {
  return (
    <span dir="auto" className={className}>
      {nameOf(actor)}
    </span>
  );
}

/** "@handle", under the name: nothing when there is no handle or the name already is it. */
export function ActorHandle({ actor, className }: { actor: ActorLike; className?: string }) {
  if (!actor.handle || nameOf(actor) === `@${actor.handle}`) return null;
  return <span className={className}>@{actor.handle}</span>;
}

/**
 * The account's picture. The toolkit makes initials from each word's first
 * character, so the name it gets has no leading "@": a handle's initial is
 * its first letter or digit, as it is for a name.
 */
export function ActorAvatar({
  actor,
  size = "md",
  className,
}: {
  actor: ActorLike;
  size?: ComponentProps<typeof Avatar>["size"];
  className?: string;
}) {
  const name = nameOf(actor);
  return (
    <Avatar
      name={name.replace(/^@/, "")}
      aria-label={name}
      src={actor.avatarUrl}
      size={size}
      className={["actor-avatar", actor.isOrganization && "avatar-square", className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

/**
 * An account as a row: its picture, its name, and a line under it
 * (`secondary`); a link to its profile unless `href` is null, with something
 * on the right (`action`) if given.
 */
export function ActorRow({
  actor,
  href,
  secondary,
  action,
  size = "md",
}: {
  actor: ActorLike;
  href: string | null;
  secondary?: ReactNode;
  action?: ReactNode;
  size?: "sm" | "md";
}) {
  const body = (
    <>
      <ActorAvatar actor={actor} size={size} />
      <span className="actor-row-text">
        <ActorName actor={actor} className="actor-row-name" />
        {secondary && <span className="actor-row-secondary">{secondary}</span>}
      </span>
    </>
  );
  return (
    <div className="actor-row">
      {href ? (
        <Link prefetch href={href} className="actor-row-main">
          {body}
        </Link>
      ) : (
        <span className="actor-row-main">{body}</span>
      )}
      {action && <span className="actor-row-action">{action}</span>}
    </div>
  );
}
