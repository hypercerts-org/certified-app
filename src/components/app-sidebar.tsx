import { Skeleton } from "@hypercerts-org/ui-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { HelpMenu } from "@/components/help-menu";
import { SidebarGroup, SidebarRows, SidebarSearch } from "@/components/sidebar-nav";
import { getAccount, getNavigationIdentity, SignedIn } from "@/components/site-header";
import { SidebarAccountMenu } from "@/components/site-nav";

// The app's navigation from 64rem, after the staging redesign: a sidebar on
// the left, full height, in place of the top bar (site-header.tsx), which
// takes over below 64rem.
//
// Everything that is the same for everyone (the search, Network, Ecosystem,
// Help) renders at once, in the cached shell. Only what depends on who is
// signed in streams in, each piece on its own: the account control, the
// Workspace group (it links to whomever you act as), Feed and Settings.
// Signed out, they render nothing; signed in, they take their place. Only the
// account control has a skeleton, for the name and picture it fetches.
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
      <Suspense fallback={null}>
        <AccountSlot />
      </Suspense>
      <SidebarSearch />
      <nav aria-label="Main" className="sidebar-nav">
        <Suspense fallback={null}>
          <WorkspaceGroup />
        </Suspense>
        <SidebarGroup label="Network">
          <Suspense fallback={null}>
            <SignedIn>
              <SidebarRows group="feed" />
            </SignedIn>
          </Suspense>
          <SidebarRows group="network" />
        </SidebarGroup>
        <SidebarGroup label="Ecosystem">
          <SidebarRows group="ecosystem" />
        </SidebarGroup>
      </nav>
      <ul className="sidebar-list sidebar-foot">
        <li>
          <HelpMenu className="sidebar-item" />
        </li>
        <Suspense fallback={null}>
          <SignedIn>
            <SidebarRows group="settings" />
          </SignedIn>
        </Suspense>
      </ul>
    </header>
  );
}

/** Signed in, the account control (signed out, Sign in is at the page's top right). */
async function AccountSlot() {
  if (!(await getNavigationIdentity())) return null;
  return (
    <div className="sidebar-account-slot">
      <Suspense fallback={<AccountControlSkeleton />}>
        <AccountControl />
      </Suspense>
    </div>
  );
}

async function AccountControl() {
  const account = await getAccount();
  return account ? <SidebarAccountMenu account={account} /> : null;
}

/** Shaped like the account control: the picture, the name and the line under it. */
function AccountControlSkeleton() {
  return (
    <div className="sidebar-account" aria-hidden>
      <Skeleton variant="box" className="skeleton-person-avatar" />
      <Skeleton variant="text" lines={2} className="sidebar-account-text" />
    </div>
  );
}

/** Signed in, the workspace of whomever you act as. */
async function WorkspaceGroup() {
  const identity = await getNavigationIdentity();
  if (!identity) return null;
  return (
    <SidebarGroup label="Workspace">
      <SidebarRows group="workspace" overview={workspaceHref(identity.actingAs)} />
    </SidebarGroup>
  );
}
