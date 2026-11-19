import { Container } from "@hypercerts-org/ui-react";
import Image from "next/image";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { cache, Suspense } from "react";
import { SignInButton } from "@/components/sign-in-button";
import { type Account, SiteNav } from "@/components/site-nav";
import { getActingAs } from "@/lib/acting-as";
import { getUser } from "@/lib/auth/dal";
import { getActor } from "@/lib/hypercerts/queries";
import { logError } from "@/lib/log";

// The site's top bar, full width (and, on phones, its bottom tab bar), below
// 64rem; wider, the sidebar (app-sidebar.tsx) takes its place. The navigation
// depends on who is signed in, so it streams in behind a Suspense boundary and
// pages keep their cached shell.
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
        <Suspense fallback={null}>
          <HeaderNav />
        </Suspense>
      </div>
    </header>
  );
}

/**
 * From 64rem, signed out: Sign in at the top right of the page, where people
 * look for it (as on the landing page), not in the sidebar among the
 * navigation. Below 64rem the top bar has it.
 */
export async function SignedOutBar() {
  if (await getAccount()) return null;
  return (
    <Container className="signed-out-bar">
      <SignInButton variant="secondary" />
    </Container>
  );
}

async function HeaderNav() {
  return <SiteNav account={await getAccount()} />;
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

async function readAccount(): Promise<Account | null> {
  const user = await getUser();
  if (!user) return null;

  // An account that has never written a Certified profile has no API view.
  const [actor, actingAs] = await Promise.all([getActor(user.did), getActingAs()]);
  const organization = actingAs && actingAs !== user.did ? await getActor(actingAs) : undefined;
  return {
    did: user.did,
    name: actor?.displayName ?? user.did,
    handle: actor?.handle ?? null,
    avatarUrl: actor?.avatarUrl ?? null,
    profile: actor?.profile ?? { displayName: "", description: "" },
    actingAs:
      actingAs && actingAs !== user.did
        ? {
            did: actingAs,
            name: organization?.displayName ?? actingAs,
            avatarUrl: organization?.avatarUrl ?? null,
          }
        : null,
  };
}
