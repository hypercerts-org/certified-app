// The public profile's header, after the staging redesign: the banner when the
// account has one; the avatar (square for an organization) beside the name and
// one meta line of facts; the lead (the bio, or else an organization's
// description, cut to three lines with Read more); the links; and the viewer's
// actions. The tabs follow it (see the profile layout).

import { Avatar, AvatarStack, ExpandableText, Skeleton, Text } from "@hypercerts-org/ui-react";
import { Eye, Link2, Mail } from "lucide-react";
import { connection } from "next/server";
import { Fragment, type ReactNode, Suspense } from "react";
import { ActorName, avatarOf } from "@/components/actor";
import { AlsoOnRow } from "@/components/also-on";
import { IntentLink } from "@/components/intent-link";
import { PageTitle } from "@/components/page-title";
import { OwnerActions, VisitorActions } from "@/components/profile-actions";
import { ProfileDescription, ProfileName } from "@/components/profile-text";
import { getActingAs } from "@/lib/acting-as";
import { getAlsoOn } from "@/lib/also-on";
import { getUser } from "@/lib/auth/dal";
import {
  getActorPlace,
  getEndorsement,
  getEndorsers,
  getFollow,
  getFollowCounts,
} from "@/lib/hypercerts/queries";
import { type ActorCard, type ActorDetail, nameOf } from "@/lib/hypercerts/views";
import { getHandle } from "@/lib/identity";
import { mayEditAccount } from "@/lib/memberships";
import { groupSettingsHref } from "@/lib/routes";

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

function LinkList({ links }: { links: AccountLink[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="profile-links" aria-label="Links">
      {links.map((link) => (
        <li key={link.href}>
          <ProfileLink link={link} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The other apps that show the account ("Also on"), then its own links. A
 * link to one of those apps is left out: "Also on" already leads there.
 */
async function AppsAndLinks({
  did,
  what,
  links,
}: {
  did: string;
  what: string;
  links: AccountLink[];
}) {
  await connection(); // per visit: not in the cached page (profile layout)
  const apps = await getAlsoOn(did);
  const shown = new Set(apps.map((app) => domainOf(app.href)));
  return (
    <>
      <AlsoOnRow links={apps} what={what} />
      <LinkList
        links={links.filter((link) => link.kind === "email" || !shown.has(domainOf(link.href)))}
      />
    </>
  );
}

/** The name, when the profile gives none: the handle, once it is checked; the DID until then. */
async function HandleName({ actor }: { actor: ActorDetail }) {
  await connection(); // per visit: not in the cached page (profile layout)
  const handle = await getHandle(actor.did);
  return (
    <ProfileName did={actor.did} rendered={actor.profile} fallback={nameOf({ ...actor, handle })} />
  );
}

/** An organization's place, last on the meta line: it takes a geocoder (getActorPlace). */
async function PlaceFact({ did, after }: { did: string; after: boolean }) {
  await connection(); // per visit: not in the cached page (profile layout)
  const place = await getActorPlace(did);
  if (!place?.short) return null;
  return (
    <>
      {after && <span aria-hidden> · </span>}
      <span className="profile-meta-item">{place.short}</span>
    </>
  );
}

/**
 * The header from the account as the API has it (getActorCore): its handle
 * and its place need outside lookups, so the parts that show them stream in.
 */
export function ProfileHeader({ actor, base }: { actor: ActorDetail; base: string }) {
  const meta = actor.isOrganization
    ? [
        actor.organizationTypes
          .map((type) => type.charAt(0).toUpperCase() + type.slice(1))
          .join(", "),
        actor.foundedDate && `Founded ${actor.foundedDate}`,
      ]
    : [actor.pronouns, actor.joined && `Joined ${actor.joined}`];
  const facts = meta.filter((item): item is string => Boolean(item));
  const named = actor.displayName !== actor.did;
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
        <Avatar {...avatarOf(actor)} size="lg" className="profile-avatar" />
        <div className="profile-identity">
          <PageTitle className="profile-name">
            <span dir="auto">
              {named ? (
                <ProfileName did={actor.did} rendered={actor.profile} fallback={nameOf(actor)} />
              ) : (
                <Suspense
                  fallback={
                    <ProfileName did={actor.did} rendered={actor.profile} fallback={actor.did} />
                  }
                >
                  <HandleName actor={actor} />
                </Suspense>
              )}
            </span>
          </PageTitle>
          {(facts.length > 0 || actor.isOrganization) && (
            <p className="profile-meta">
              {facts.map((fact, i) => (
                <Fragment key={fact}>
                  {i > 0 && <span aria-hidden> · </span>}
                  <span className="profile-meta-item">{fact}</span>
                </Fragment>
              ))}
              {actor.isOrganization && (
                <Suspense fallback={null}>
                  <PlaceFact did={actor.did} after={facts.length > 0} />
                </Suspense>
              )}
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
          <Suspense fallback={<LinkList links={accountLinks} />}>
            <AppsAndLinks
              did={actor.did}
              what={actor.isOrganization ? "organization" : "profile"}
              links={accountLinks}
            />
          </Suspense>
          <TrustLine did={actor.did} base={base} />
        </div>
        <div className="profile-actions">
          {/* Who is viewing decides the actions; the rest of the page stays
              cached for everyone. */}
          <Suspense
            fallback={
              <VisitorActions
                did={actor.did}
                path={base}
                title={nameOf(actor)}
                actor={undefined}
                follow={null}
                endorsement={null}
              />
            }
          >
            <ViewerActions actor={actor} base={base} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

/**
 * Who is viewing decides the actions. The buttons don't wait for whether
 * they follow or endorse (those stream into them), nor for the handle: Share
 * uses the page's address.
 */
async function ViewerActions({ actor, base }: { actor: ActorDetail; base: string }) {
  const actingAs = await getActingAs();
  const title = nameOf(actor);
  if (actingAs === actor.did) {
    // Acting as an organization, only its admins and owners may edit it.
    const [canEdit, user] = await Promise.all([mayEditAccount(actor.did), getUser()]);
    const editHref = canEdit
      ? user?.did === actor.did
        ? "/settings/profile"
        : `${groupSettingsHref(actor.did)}/profile`
      : null;
    return <OwnerActions editHref={editHref} path={base} title={title} />;
  }
  return (
    <VisitorActions
      did={actor.did}
      path={base}
      title={title}
      actor={actingAs}
      follow={actingAs ? getFollow(actingAs, actor.did) : null}
      endorsement={actingAs ? getEndorsement(actingAs, actor.did) : null}
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
 * Each part comes on its own: the follow counts are quick, the endorsers may
 * take longer.
 */
function TrustLine({ did, base }: { did: string; base: string }) {
  return (
    // Empty (hidden) when there is nothing to show this viewer.
    <div className="trust-line">
      <Suspense fallback={null}>
        <Endorsed did={did} base={base} />
      </Suspense>
      <Suspense fallback={null}>
        <FollowCounts did={did} base={base} />
      </Suspense>
    </div>
  );
}

/** Endorsements only when there are some: an absence says nothing here. */
async function Endorsed({ did, base }: { did: string; base: string }) {
  await connection(); // per visit: not in the cached page (profile layout)
  const { endorsers, more } = await getEndorsers(did);
  if (endorsers.length === 0) return null;
  return (
    <IntentLink href={`${base}/endorsements`} className="trust-endorsed">
      <AvatarStack avatars={endorsers.map(avatarOf)} total={endorsers.length + (more ? 1 : 0)} />
      <span>Endorsed by {endorserNames(endorsers, more)}</span>
    </IntentLink>
  );
}

/** On one line under the endorsements, as staging has it. */
async function FollowCounts({ did, base }: { did: string; base: string }) {
  await connection(); // per visit: not in the cached page (profile layout)
  const { followers, following } = await getFollowCounts(did);
  if (followers === 0 && following === 0) return null;
  return (
    <p className="trust-counts">
      {followers > 0 && (
        <IntentLink href={`${base}/followers`} className="trust-count">
          <strong>{numberFormat.format(followers)}</strong>
          {followers === 1 ? " follower" : " followers"}
        </IntentLink>
      )}
      {followers > 0 && following > 0 && <span aria-hidden> · </span>}
      {following > 0 && (
        <IntentLink href={`${base}/following`} className="trust-count">
          <strong>{numberFormat.format(following)}</strong> following
        </IntentLink>
      )}
    </p>
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
