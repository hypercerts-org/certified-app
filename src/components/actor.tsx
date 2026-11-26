// An account, wherever the app shows one. The pictures, links, rows and
// stacks are the toolkit's (Avatar, IdentityLink, IdentityRow, AvatarStack);
// this decides what of an account they show, so an account reads and looks
// the same everywhere: its profile name, else its handle, else its DID
// (nameOf); its picture, else the initials of that name; a square for an
// organization.
//
//   <Avatar {...avatarOf(actor)} size="sm" />
//   <IdentityLink {...identityOf(actor)} href={actorHref(actor)} />
//   <IdentityRow {...identityOf(actor)} href={actorHref(actor)} secondary="…" />
//   <AvatarStack avatars={actors.map(avatarOf)} total={count} />

import { type ActorCard, nameOf } from "@/lib/hypercerts/views";

export { actorHref } from "@/lib/routes";

/**
 * What these need of an account: an ActorCard, or as much of one as a caller
 * has. Without a DID it is someone named but without an account (an
 * activity's contributor given by name).
 */
export type ActorLike = Pick<ActorCard, "handle" | "displayName" | "avatarUrl"> & {
  did?: string;
  isOrganization?: boolean;
};

const shapeOf = (actor: ActorLike): "circle" | "square" =>
  actor.isOrganization ? "square" : "circle";

/** An account as an `Avatar` (or an `AvatarStack` item): name, picture, shape. */
export function avatarOf(actor: ActorLike) {
  return { name: nameOf(actor), src: actor.avatarUrl, shape: shapeOf(actor) };
}

/** An account as an `IdentityLink` or `IdentityRow`: name, picture, shape. */
export function identityOf(actor: ActorLike) {
  return { name: nameOf(actor), avatarSrc: actor.avatarUrl, avatarShape: shapeOf(actor) };
}

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
