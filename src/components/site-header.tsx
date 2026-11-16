import { Container } from "@hypercerts-org/ui-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { SiteNav } from "@/components/site-nav";
import { getUser } from "@/lib/auth/dal";
import { getActor } from "@/lib/hypercerts/queries";

// The site's top bar (and, on phones, its bottom tab bar). The navigation
// depends on who is signed in, so it streams in behind a Suspense boundary and
// pages keep their cached shell.
export function SiteHeader() {
  return (
    <header className="site-header">
      <Container as="div" className="site-header-row">
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
      </Container>
    </header>
  );
}

async function HeaderNav() {
  const user = await getUser();
  if (!user) return <SiteNav account={null} />;

  // An account that has never written a Certified profile has no API view.
  const actor = await getActor(user.did);
  return (
    <SiteNav
      account={{
        did: user.did,
        name: actor?.displayName ?? user.did,
        avatarUrl: actor?.avatarUrl ?? null,
        profile: actor?.profile ?? { displayName: "", description: "" },
      }}
    />
  );
}
