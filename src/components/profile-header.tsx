// The public profile's header, after the staging redesign: the banner when the
// account has one; the avatar (square for an organization) beside the name and
// one meta line of facts; the lead (the bio, or else an organization's
// description, cut to three lines with Read more); the links; and the viewer's
// actions. The tabs follow it (see the profile layout).

import { ExpandableText, Skeleton, Text } from "@hypercerts-org/ui-react";
import { Eye, Link2, Mail } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode, Suspense } from "react";
import { ActorAvatar, ActorName } from "@/components/actor";
import { actorHref } from "@/components/cards";
import { PageTitle } from "@/components/page-title";
import { OwnerActions, VisitorActions } from "@/components/profile-actions";
import { ProfileDescription, ProfileName } from "@/components/profile-text";
import { getActingAs } from "@/lib/acting-as";
import { getEndorsers, getFollow, getFollowCounts } from "@/lib/hypercerts/queries";
import { type ActorCard, type ActorDetail, nameOf } from "@/lib/hypercerts/views";
import { mayEditProfile } from "@/lib/memberships";

/** One of the header's links: Bluesky as its icon, an email as itself, the rest by label. */
function ProfileLink({ link }: { link: AccountLink }) {
  if (link.kind === "bluesky") {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="profile-link-icon"
        title={link.label}
      >
        <BlueskyIcon />
        <span className="visually-hidden">Bluesky (opens in a new tab)</span>
      </a>
    );
  }
  if (link.kind === "email") {
    return (
      <>
        <Mail size={16} aria-hidden />
        <a href={link.href}>{link.label}</a>
      </>
    );
  }
  return (
    <>
      <Link2 size={16} aria-hidden />
      {/* A labelled link names its address on hover, where it leads. */}
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        title={link.address ?? undefined}
        dir="auto"
      >
        {link.label}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    </>
  );
}

type AccountLink = {
  href: string;
  /** What the link reads: its own label, else its domain. */
  label: string;
  /** The full address, shown on hover. */
  address: string | null;
  kind: "web" | "bluesky" | "email";
};

const shortAddress = (url: string) =>
  url
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();

/** The domain a link leads to, without "www.": "facebook.com". */
const domainOf = (url: string) => new URL(url).hostname.replace(/^www\./i, "").toLowerCase();

/**
 * Every link once: the website first, then an organization's other links (by
 * their labels, "Donation page", when they have one), then its public email.
 * A Bluesky profile shows as its butterfly, as on staging.
 */
function links(actor: ActorDetail): AccountLink[] {
  const seen = new Set<string>();
  const out: AccountLink[] = [];
  const entries = [...(actor.website ? [{ url: actor.website, label: null }] : []), ...actor.urls];
  for (const { url, label } of entries) {
    const address = shortAddress(url); // http(s) only, checked when mapped (safeUrl)
    if (seen.has(address)) continue;
    seen.add(address);
    const bluesky = /^(bsky\.app|bsky\.social)(\/|$)/.test(address);
    out.push({
      href: url,
      // Long addresses made the list hard to read: the domain says where it
      // leads, and the full address shows on hover.
      label: label ?? domainOf(url),
      address,
      kind: bluesky ? "bluesky" : "web",
    });
  }
  if (actor.publicEmail) {
    out.push({
      href: `mailto:${actor.publicEmail}`,
      label: actor.publicEmail,
      address: null,
      kind: "email",
    });
  }
  return out;
}

export function ProfileHeader({ actor, base }: { actor: ActorDetail; base: string }) {
  const meta = actor.isOrganization
    ? [
        actor.organizationTypes
          .map((type) => type.charAt(0).toUpperCase() + type.slice(1))
          .join(", "),
        actor.place?.short,
        actor.foundedDate && `Founded ${actor.foundedDate}`,
      ]
    : [actor.pronouns, actor.joined && `Joined ${actor.joined}`];
  const facts = meta.filter((item): item is string => Boolean(item));
  const bio = actor.profile.description.trim() || null;
  const lead = bio ?? (actor.isOrganization ? actor.longDescription : null);
  const accountLinks = links(actor);

  return (
    <header className="profile-header">
      <Suspense fallback={null}>
        <OwnerNote did={actor.did} />
      </Suspense>
      {actor.bannerUrl && (
        <div className="profile-banner">
          {/* biome-ignore lint/performance/noImgElement: Bluesky's CDN, already sized */}
          <img src={actor.bannerUrl} alt="" />
        </div>
      )}
      <div className="profile-head">
        <ActorAvatar actor={actor} size="lg" className="profile-avatar" />
        <div className="profile-identity">
          <PageTitle className="profile-name">
            <span dir="auto">
              <ProfileName did={actor.did} rendered={actor.profile} fallback={nameOf(actor)} />
            </span>
          </PageTitle>
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
        </div>
        {/* Its own area, so on a wide page it can run on under the actions. */}
        <div className="profile-about">
          {lead && (
            <ExpandableText lines={4} className="profile-lead expandable-fade">
              {bio ? (
                // The bio as this browser should show it, saves included.
                <ProfileDescription rendered={actor.profile} />
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
                  <ProfileLink link={link} />
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
  if (actingAs === actor.did) {
    // Acting as an organization, only its admins and owners may edit it.
    return (
      <OwnerActions
        editHref={(await mayEditProfile(actor.did)) ? `${actorHref(actor.did)}/edit` : null}
        path={base}
        title={nameOf(actor)}
      />
    );
  }
  return (
    <VisitorActions
      did={actor.did}
      path={base}
      title={nameOf(actor)}
      actor={actingAs}
      follow={actingAs ? await getFollow(actingAs, actor.did) : null}
    />
  );
}

/** The account's own profile, seen by whoever acts as it, says it's the public view. */
async function OwnerNote({ did }: { did: string }) {
  if ((await getActingAs()) !== did) return null;
  return (
    <p className="profile-owner-note">
      <Eye size={16} aria-hidden />
      This is how others see your profile.
    </p>
  );
}

/** Bluesky's butterfly (Simple Icons). */
function BlueskyIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.296 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z" />
    </svg>
  );
}

const NAMED = 2;
const FACES = 3;
const numberFormat = new Intl.NumberFormat("en");

/** "A", "A and B", "A, B and 3 others" (or "and others" past the latest page). */
function endorserNames(endorsers: ActorCard[], more: boolean): ReactNode {
  const name = (actor: ActorCard) => <ActorName actor={actor} className="trust-name" />;
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
  const [{ endorsers, more }, counts] = await Promise.all([
    getEndorsers(did),
    getFollowCounts(did),
  ]);
  const { followers, following } = counts;
  return (
    // Empty (hidden) when there is nothing to show this viewer.
    <div className="trust-line">
      {/* Endorsements and follows only when there are some: an absence says nothing here. */}
      {endorsers.length > 0 && (
        <Link prefetch href={`${base}/endorsements`} className="trust-endorsed">
          <span className="trust-faces" aria-hidden>
            {endorsers.slice(0, FACES).map((actor) => (
              <ActorAvatar key={actor.did} actor={actor} size="sm" />
            ))}
          </span>
          <span>Endorsed by {endorserNames(endorsers, more)}</span>
        </Link>
      )}
      {/* On one line with the endorsements, as staging has it. */}
      {(followers > 0 || following > 0) && (
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
      )}
    </div>
  );
}

/**
 * Shaped like the header (the avatar beside the name, the meta line and two
 * lines of lead) and the tabs under it, so the page doesn't jump when they
 * arrive. Only a profile nobody has opened in the last hour shows it: others
 * come from the cache with the page.
 */
export function ProfileHeaderSkeleton() {
  return (
    <div className="profile-header-skeleton" aria-hidden>
      <div className="profile-head">
        <Skeleton variant="box" className="skeleton-avatar" />
        <div className="profile-identity">
          <Skeleton variant="line" className="skeleton-name" />
          <Skeleton variant="line" className="skeleton-meta" />
        </div>
        <div className="profile-about">
          <Skeleton variant="text" lines={2} className="skeleton-lead" />
        </div>
      </div>
    </div>
  );
}
