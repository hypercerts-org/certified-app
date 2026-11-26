import { Avatar } from "@hypercerts-org/ui-react";
import Link from "next/link";
import { Suspense } from "react";
import { avatarOf } from "@/components/actor";
import { getAccount } from "@/components/site-header";
import { Wordmark } from "@/components/wordmark";

/**
 * The landing page's chrome: the Certified.app wordmark, and Sign in (or,
 * for whoever is signed in, Open app with their avatar). The page around it
 * is the same for everyone and cached; only the button depends on who is
 * viewing, so it streams in on its own.
 */
export default function LandingTopBar() {
  return (
    <>
      <div className="lp-topbar">
        <Link href="/welcome" className="lp-topbar__home" aria-label="Certified.app home">
          <Wordmark variant="certified-app" faded height={18} decorative />
        </Link>
      </div>
      <div className="lp-topbar__actions">
        <Suspense fallback={null}>
          <AccountButton />
        </Suspense>
      </div>
    </>
  );
}

async function AccountButton() {
  const account = await getAccount();
  if (account) {
    return (
      <Link href="/workspace" className="lp-topbar__btn lp-topbar__btn--account">
        <Avatar {...avatarOf(account)} size="sm" />
        Open app
      </Link>
    );
  }
  return (
    <form method="post" action="/oauth/sign-in">
      <input type="hidden" name="returnTo" value="/workspace" />
      <button type="submit" className="lp-topbar__btn">
        Sign in
      </button>
    </form>
  );
}
