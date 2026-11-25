import { Container, Skeleton } from "@hypercerts-org/ui-react";
import Image from "next/image";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { cache, type ReactNode, Suspense } from "react";
import { SignInButton } from "@/components/sign-in-button";
import { type Account, Destinations, HeaderAccountMenus } from "@/components/site-nav";
import { getActingAs } from "@/lib/acting-as";
import { CERTIFIED_PDS_URL } from "@/lib/auth/config";
import { getUser } from "@/lib/auth/dal";
import { getActor } from "@/lib/hypercerts/queries";
import { logError } from "@/lib/log";

// The site's top bar, full width (and, on phones, its bottom tab bar), below
// 64rem; wider, the sidebar (app-sidebar.tsx) takes its place. As there, what
// is the same for everyone (the wordmark, Network, Apps) renders at once, in
// the cached shell; what depends on who is signed in (Workspace, the account
// menu or Sign in) streams in, each piece on its own.
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-row">
        <Link href="/" className="brand" aria-label="Certified home">
          <Image
            src="/brand/wordmark/certified_wordmark_black.svg"
            alt="Certified"
            width={99}
            height={19}
            preload
          />
        </Link>
        <nav aria-label="Main" className="site-nav desktop-only">
          <Suspense fallback={null}>
            <SignedIn>
              <Destinations variant="top" only={["workspace"]} />
            </SignedIn>
          </Suspense>
          <Destinations variant="top" only={["network", "apps"]} />
        </nav>
        <div className="site-header-actions">
          <Suspense fallback={null}>
            <HeaderAccount />
          </Suspense>
        </div>
      </div>
      <nav aria-label="Main" className="bottom-nav phone-only">
        <Suspense fallback={null}>
          <SignedIn>
            <Destinations variant="bottom" only={["workspace"]} />
          </SignedIn>
        </Suspense>
        <Destinations variant="bottom" only={["network", "apps"]} />
      </nav>
    </header>
  );
}

/** Signed in, the account menu (a skeleton of its picture until the profile arrives); signed out, Sign in. */
async function HeaderAccount() {
  if (!(await getNavigationIdentity())) return <SignInButton variant="secondary" />;
  return (
    <Suspense fallback={<Skeleton variant="box" className="skeleton-account-avatar" />}>
      <HeaderAccountLoaded />
    </Suspense>
  );
}

async function HeaderAccountLoaded() {
  const account = await getAccount();
  return account ? <HeaderAccountMenus account={account} /> : null;
}

/** Its children, only for someone signed in. */
export async function SignedIn({ children }: { children: ReactNode }) {
  return (await getNavigationIdentity()) ? children : null;
}

/**
 * From 64rem, signed out: Sign in at the top right of the page, where people
 * look for it (as on the landing page), not in the sidebar among the
 * navigation. Below 64rem the top bar has it.
 */
export async function SignedOutBar() {
  if (await getNavigationIdentity()) return null;
  return (
    <Container className="signed-out-bar">
      <SignInButton variant="secondary" />
    </Container>
  );
}

/**
 * The signed-in account as the navigation shows it (the top bar and the
 * sidebar), or null when signed out. Once per request.
 */
export const getAccount = cache(async (): Promise<Account | null> => {
  try {
    return await readAccount();
  } catch (err) {
    unstable_rethrow(err); // Next's own signals (prerendering, redirects) pass through
    // The chrome of every page, public ones included, renders this: a Valkey
    // or API outage shows the signed-out navigation (and is logged) rather
    // than failing the page. It changes no session.
    logError("[account] navigation account failed", err);
    return null;
  }
});

/**
 * Who the navigation is for, without the profile: the signed-in account and
 * whom it acts as, or null when signed out. Fast (the session and the
 * memberships are cached), so the sidebar's signed-in pieces don't wait for
 * the account's name and picture. Like getAccount, an outage shows the
 * signed-out navigation rather than failing the page.
 */
export const getNavigationIdentity = cache(
  async (): Promise<{ did: string; actingAs: string } | null> => {
    try {
      const user = await getUser();
      if (!user) return null;
      return { did: user.did, actingAs: (await getActingAs()) ?? user.did };
    } catch (err) {
      unstable_rethrow(err); // Next's own signals (prerendering, redirects) pass through
      logError("[account] navigation identity failed", err);
      return null;
    }
  },
);

async function readAccount(): Promise<Account | null> {
  const user = await getUser();
  if (!user) return null;

  // An account that has never written a Certified profile has no API view.
  const [actor, actingAs] = await Promise.all([getActor(user.did), getActingAs()]);
  const organization = actingAs && actingAs !== user.did ? await getActor(actingAs) : undefined;
  return {
    did: user.did,
    displayName: actor?.displayName ?? user.did,
    handle: actor?.handle ?? null,
    avatarUrl: actor?.avatarUrl ?? null,
    isOrganization: actor?.isOrganization,
    pdsDomain: new URL(CERTIFIED_PDS_URL).hostname,
    profile: actor?.profile ?? { displayName: "", description: "" },
    actingAs:
      actingAs && actingAs !== user.did
        ? {
            did: actingAs,
            handle: organization?.handle ?? null,
            displayName: organization?.displayName ?? actingAs,
            avatarUrl: organization?.avatarUrl ?? null,
            isOrganization: true,
          }
        : null,
  };
}
