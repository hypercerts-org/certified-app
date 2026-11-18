import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { SiteNav } from "@/components/site-nav";
import { getActingAs } from "@/lib/acting-as";
import { getUser } from "@/lib/auth/dal";
import { getActor } from "@/lib/hypercerts/queries";
import { getHandle } from "@/lib/identity";

// The site's top bar, full width (and, on phones, its bottom tab bar). The navigation
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

async function HeaderNav() {
  const user = await getUser();
  if (!user) return <SiteNav account={null} />;

  // An account that has never written a Certified profile has no API view.
  const [actor, handle, actingAs] = await Promise.all([
    getActor(user.did),
    getHandle(user.did),
    getActingAs(),
  ]);
  const organization = actingAs && actingAs !== user.did ? await getActor(actingAs) : undefined;
  return (
    <SiteNav
      account={{
        did: user.did,
        name: actor?.displayName ?? user.did,
        handle,
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
      }}
    />
  );
}
