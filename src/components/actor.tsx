// An account, wherever the app shows one: its name (ActorName), its picture
// (ActorAvatar), a link to it (ActorLink: the picture and name, or the name in
// a sentence), or a row (ActorRow). Every account goes through
// these, so an account reads and looks the same everywhere: its profile name,
// else its handle, else its DID (nameOf); its picture, else the initials of
// that name on an opaque disc; a square for an organization. Several at once
// are a stack (AvatarStack, ActorStack).

import { Avatar } from "@hypercerts-org/ui-react";
import type { ComponentProps, ReactNode } from "react";
import { IntentLink } from "@/components/intent-link";
import { type ActorCard, nameOf } from "@/lib/hypercerts/views";
export { actorHref } from "@/lib/routes";
import { actorHref } from "@/lib/routes";

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

/** A stack shows at most this many pictures; more are marked, not shown. */
const STACK_MAX = 4;

/**
 * Several small pictures in a row, overlapping, wherever the app shows a
 * group at once: who endorsed, followed or gave, evaluators, what gifts went
 * to. At most `max` show; when there are more (`total`, or more children than
 * fit), an "…" marks the rest. The sentence beside it names and counts them,
 * so the stack itself is decoration.
 */
export function AvatarStack({
  children,
  total,
  max = STACK_MAX,
}: {
  /** The pictures, small (ActorAvatar size "sm", or a record's thumbnail). */
  children: ReactNode[];
  /** How many there are in all, when that is more than the pictures given. */
  total?: number;
  max?: number;
}) {
  const shown = children.slice(0, max);
  const more = Math.max(total ?? 0, children.length) > shown.length;
  return (
    <span className="avatar-stack" aria-hidden>
      {shown}
      {more && <span className="avatar-stack-more">…</span>}
    </span>
  );
}

/** Accounts as a stack: their pictures, overlapping, the rest marked. */
export function ActorStack({
  actors,
  total,
  max,
}: {
  actors: ActorLike[];
  total?: number;
  max?: number;
}) {
  return (
    <AvatarStack total={total} max={max}>
      {actors.map((actor, i) => (
        <ActorAvatar key={actor.did ?? i} actor={actor} size="sm" />
      ))}
    </AvatarStack>
  );
}

/**
 * A link to the account's profile: its picture and name, or (`avatar`
 * false) its name alone, as in a sentence. The name underlines on hover, as
 * every account link does.
 */
export function ActorLink({
  actor,
  avatar = "sm",
  className,
}: {
  actor: ActorLike & { did: string };
  avatar?: ComponentProps<typeof Avatar>["size"] | false;
  className?: string;
}) {
  return (
    <IntentLink
      href={actorHref({ did: actor.did, handle: actor.handle })}
      className={["actor-link", className].filter(Boolean).join(" ")}
    >
      {avatar && <ActorAvatar actor={actor} size={avatar} />}
      <ActorName actor={actor} className="actor-link-name" />
    </IntentLink>
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
        <IntentLink href={href} className="actor-row-main">
          {body}
        </IntentLink>
      ) : (
        <span className="actor-row-main">{body}</span>
      )}
      {action && <span className="actor-row-action">{action}</span>}
    </div>
  );
}
