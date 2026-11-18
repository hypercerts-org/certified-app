// The public profile's header, after the staging redesign: the banner when the
// account has one; the avatar (square for an organization) beside the name and
// one meta line of facts; the lead (the bio, or else an organization's
// description, cut to three lines with Read more); the links; and the viewer's
// actions. The tabs follow it (see the profile layout).

import { Avatar, ExpandableText, Skeleton, Text } from "@hypercerts-org/ui-react";
import { Link2 } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode, Suspense } from "react";
import { actorHref } from "@/components/cards";
import { OwnerActions, VisitorActions } from "@/components/profile-actions";
import { ProfileDescription, ProfileName } from "@/components/profile-text";
import { getActingAs } from "@/lib/acting-as";
import { getEndorsers, getFollowCounts } from "@/lib/hypercerts/queries";
import type { ActorCard, ActorDetail } from "@/lib/hypercerts/views";

/** Every link once: the website first, then an organization's other links. */
function links(actor: ActorDetail): { href: string; label: string }[] {
  const seen = new Set<string>();
  const out: { href: string; label: string }[] = [];
  for (const raw of [actor.website, ...actor.urls]) {
    if (!raw || !/^https?:\/\//i.test(raw)) continue;
    const label = raw
      .replace(/^https?:\/\/(www\.)?/i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ href: raw, label });
  }
  return out;
}

export function ProfileHeader({ actor, base }: { actor: ActorDetail; base: string }) {
  const meta = actor.isOrganization
    ? [
        actor.organizationTypes
          .map((type) => type.charAt(0).toUpperCase() + type.slice(1))
          .join(", "),
        actor.place,
        actor.foundedDate && `Founded ${actor.foundedDate}`,
      ]
    : [actor.pronouns, actor.joined && `Joined ${actor.joined}`];
  const facts = meta.filter((item): item is string => Boolean(item));
  const bio = actor.profile.description.trim() || null;
  const lead = bio ?? (actor.isOrganization ? actor.longDescription : null);
  const accountLinks = links(actor);

  return (
    <header className="profile-header">
      {actor.bannerUrl && (
        <div className="profile-banner">
          {/* biome-ignore lint/performance/noImgElement: Bluesky's CDN, already sized */}
          <img src={actor.bannerUrl} alt="" />
        </div>
      )}
      <div className="profile-head">
        <Avatar
          name={actor.displayName}
          src={actor.avatarUrl}
          size="lg"
          className={
            actor.isOrganization ? "profile-avatar profile-avatar-square" : "profile-avatar"
          }
        />
        <div className="profile-identity">
          <h1 className="profile-name" dir="auto">
            <ProfileName did={actor.did} rendered={actor.profile} />
          </h1>
          {facts.length > 0 && (
            <p className="profile-meta">
              {facts.map((fact, i) => (
                <Fragment key={fact}>
                  {i > 0 && <span aria-hidden> · </span>}
                  <span className="profile-meta-item">{fact}</span>
                </Fragment>
              ))}
            </p>
          )}
          {lead && (
            <ExpandableText lines={3} className="profile-lead">
              {bio ? (
                // The bio as this browser should show it, saves included.
                <ProfileDescription did={actor.did} rendered={actor.profile} />
              ) : (
                <Text relaxed className="prewrap" dir="auto">
                  {lead}
                </Text>
              )}
            </ExpandableText>
          )}
          {accountLinks.length > 0 && (
            <ul className="profile-links" aria-label="Links">
              {accountLinks.map((link) => (
                <li key={link.href}>
                  <Link2 size={16} aria-hidden />
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label}
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Suspense fallback={null}>
            <TrustLine did={actor.did} base={base} />
          </Suspense>
        </div>
        <div className="profile-actions">
          {/* Who is viewing decides the actions; the rest of the page stays
              cached for everyone. */}
          <Suspense fallback={null}>
            <ViewerActions actor={actor} base={base} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

/** Share uses the profile's own address: its handle, where it has one. */
async function ViewerActions({ actor, base }: { actor: ActorDetail; base: string }) {
  const actingAs = await getActingAs();
  return actingAs === actor.did ? (
    <OwnerActions editHref={`${actorHref(actor.did)}/edit`} path={base} title={actor.displayName} />
  ) : (
    <VisitorActions did={actor.did} path={base} title={actor.displayName} />
  );
}

const NAMED = 2;
const FACES = 3;
const numberFormat = new Intl.NumberFormat("en");

/** "A", "A and B", "A, B and 3 others" (or "and others" past the latest page). */
function endorserNames(endorsers: ActorCard[], more: boolean): ReactNode {
  const name = (actor: ActorCard) => (
    <span className="trust-name" dir="auto">
      {actor.displayName}
    </span>
  );
  const [first, second] = endorsers;
  const rest = endorsers.length - NAMED;
  if (!second) return name(first);
  if (rest <= 0 && !more)
    return (
      <>
        {name(first)} and {name(second)}
      </>
    );
  const others = more
    ? "others"
    : `${numberFormat.format(rest)} ${rest === 1 ? "other" : "others"}`;
  return (
    <>
      {name(first)}, {name(second)} and <span className="trust-name">{others}</span>
    </>
  );
}

/**
 * Who endorsed the account (faces and names), then its followers and whom it
 * follows, each leading to its tab. Parts with nothing in them are left out.
 */
async function TrustLine({ did, base }: { did: string; base: string }) {
  const [{ endorsers, more }, follows] = await Promise.all([
    getEndorsers(did),
    getFollowCounts(did),
  ]);
  const { followers, following } = follows;
  if (endorsers.length === 0 && followers === 0 && following === 0) return null;

  return (
    <div className="trust-line">
      {endorsers.length > 0 && (
        <Link href={`${base}/endorsements`} className="trust-endorsed">
          <span className="trust-faces" aria-hidden>
            {endorsers.slice(0, FACES).map((actor) => (
              <Avatar key={actor.did} name={actor.displayName} src={actor.avatarUrl} size="sm" />
            ))}
          </span>
          <span>Endorsed by {endorserNames(endorsers, more)}</span>
        </Link>
      )}
      {(followers > 0 || following > 0) && (
        <p className="trust-counts">
          {followers > 0 && (
            <Link href={`${base}/followers`} className="trust-count">
              <strong>{numberFormat.format(followers)}</strong>
              {followers === 1 ? " follower" : " followers"}
            </Link>
          )}
          {followers > 0 && following > 0 && <span aria-hidden> · </span>}
          {following > 0 && (
            <Link href={`${base}/following`} className="trust-count">
              <strong>{numberFormat.format(following)}</strong> following
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

export function ProfileHeaderSkeleton() {
  return (
    <div className="profile-head" aria-hidden>
      <Skeleton variant="circle" />
      <div className="profile-identity">
        <Skeleton variant="text" lines={3} />
      </div>
    </div>
  );
}
