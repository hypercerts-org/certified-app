import { Avatar } from "@hypercerts-org/ui-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getAccount } from "@/components/site-header";

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
        <Link href="/welcome" className="lp-topbar__home" aria-label="Certified home">
          <Image
            src="/brand/wordmark/certified_wordmark_black.svg"
            alt=""
            width={94}
            height={18}
            preload
          />
          <span className="sidebar-brand-suffix" aria-hidden>
            .app
          </span>
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
        <Avatar name={account.name} src={account.avatarUrl} size="sm" />
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
