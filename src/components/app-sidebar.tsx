import { Skeleton } from "@hypercerts-org/ui-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { getAccount } from "@/components/site-header";

// The app's navigation from 64rem, after the staging redesign: a sidebar on
// the left, full height, in place of the top bar (site-header.tsx), which
// takes over below 64rem. The brand renders at once; the rest depends on who
// is signed in, so it streams in behind a Suspense boundary and pages keep
// their cached shell.
export function AppSidebar() {
  return (
    <header className="app-sidebar">
      <Link href="/" className="sidebar-brand" aria-label="Certified home">
        <Image
          src="/brand/wordmark/certified_wordmark_black.svg"
          alt=""
          width={99}
          height={19}
          preload
        />
        <span className="sidebar-brand-suffix" aria-hidden>
          .app
        </span>
      </Link>
      <Suspense fallback={<SidebarPlaceholder />}>
        <SidebarBody />
      </Suspense>
    </header>
  );
}

async function SidebarBody() {
  return <SidebarNav account={await getAccount()} />;
}

/** Shaped like the account control, so the rows don't move when it arrives. */
function SidebarPlaceholder() {
  return (
    <div className="sidebar-account-slot" aria-hidden>
      <Skeleton variant="text" lines={2} />
    </div>
  );
}
