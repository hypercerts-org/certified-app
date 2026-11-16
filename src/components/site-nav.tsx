"use client";

import {
  Avatar,
  BottomSheet,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  FolderOpen,
  Globe,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  Settings,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { actorHref, workspaceHref } from "@/components/cards";
import { ProfileName } from "@/components/profile-text";
import { SignInButton } from "@/components/sign-in-button";
import { SignOutForm } from "@/components/sign-out-form";
import type { ProfileFields } from "@/lib/hypercerts/views";
import type { Organization } from "@/lib/organizations";

/** The signed-in account, as the header shows it. */
export type Account = {
  did: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  profile: ProfileFields;
};

// The app's destinations, in the order every navigation surface uses:
// Workspace (what you and your organizations manage), Network (everyone's
// work) and Apps (other apps that work with the same account). Profile and
// Settings live in the account menu. Network has one page so far, Explore;
// it becomes a menu of its pages when Feed, Map and the others arrive.

type Destination = {
  key: "workspace" | "network" | "apps";
  label: string;
  href: string;
  icon: LucideIcon;
  signedInOnly: boolean;
  isActive: (pathname: string) => boolean;
};

/** `/workspace`, and any account's workspace or profile editor. */
const WORKSPACE_PATH = /^\/(?:workspace|(did:[^/]+)\/(?:workspace|edit))(?:\/|$)/;

const under = (base: string) => (pathname: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

const DESTINATIONS: readonly Destination[] = [
  {
    key: "workspace",
    label: "Workspace",
    href: "/workspace",
    icon: FolderOpen,
    signedInOnly: true,
    isActive: (pathname) => WORKSPACE_PATH.test(pathname),
  },
  {
    key: "network",
    label: "Network",
    href: "/explore",
    icon: Globe,
    signedInOnly: false,
    isActive: under("/explore"),
  },
  {
    key: "apps",
    label: "Apps",
    href: "/apps",
    icon: LayoutGrid,
    signedInOnly: false,
    isActive: under("/apps"),
  },
];

/** The workspace `pathname` is in: an account's DID, or null outside the Workspace. */
function currentWorkspace(pathname: string, account: Account): string | null {
  const match = WORKSPACE_PATH.exec(pathname);
  if (!match) return null;
  return match[1] ?? account.did;
}

function useDecodedPathname() {
  return decodeURIComponent(usePathname());
}

export function SiteNav({ account }: { account: Account | null }) {
  const pathname = useDecodedPathname();
  const destinations = DESTINATIONS.filter((d) => account || !d.signedInOnly);

  return (
    <>
      <nav aria-label="Main" className="site-nav desktop-only">
        {destinations.map((destination) =>
          destination.key === "workspace" && account ? (
            <DesktopWorkspaceMenu key={destination.key} account={account} pathname={pathname} />
          ) : (
            <Link
              key={destination.key}
              href={destination.href}
              className="nav-link"
              aria-current={destination.isActive(pathname) ? "page" : undefined}
            >
              <destination.icon size={18} strokeWidth={1.5} aria-hidden />
              {destination.label}
            </Link>
          ),
        )}
      </nav>

      <div className="site-header-actions">
        {account ? (
          <>
            <DesktopAccountMenu account={account} />
            <PhoneAccountMenu account={account} />
          </>
        ) : (
          <SignInButton />
        )}
      </div>

      <nav aria-label="Main" className="bottom-nav phone-only">
        {destinations.map((destination) =>
          destination.key === "workspace" && account ? (
            <PhoneWorkspaceTab key={destination.key} account={account} pathname={pathname} />
          ) : (
            <Link
              key={destination.key}
              href={destination.href}
              className="bottom-nav-item"
              aria-current={destination.isActive(pathname) ? "page" : undefined}
            >
              <destination.icon size={22} strokeWidth={1.5} aria-hidden />
              {destination.label}
            </Link>
          ),
        )}
      </nav>
    </>
  );
}

// Workspaces ----------------------------------------------------------------

async function fetchOrganizations(): Promise<Organization[]> {
  const response = await fetch("/api/me/organizations");
  if (!response.ok) throw new Error(`Organizations request failed: ${response.status}`);
  return ((await response.json()) as { organizations: Organization[] }).organizations;
}

/**
 * Your organizations, loaded as soon as the header shows (not when the
 * switcher opens), so the list is complete by the time it does. Kept for five
 * minutes, like the server's cache of them.
 */
function useOrganizations() {
  return useQuery({
    queryKey: ["me", "organizations"],
    queryFn: fetchOrganizations,
    staleTime: 5 * 60_000,
  });
}

/** Your workspace, then each organization's, the current one checked. */
function WorkspaceList({
  account,
  current,
  organizations,
  onNavigate,
}: {
  account: Account;
  current: string | null;
  organizations: UseQueryResult<Organization[]>;
  onNavigate: () => void;
}) {
  return (
    <ul className="menu-list">
      <WorkspaceRow
        href={workspaceHref(account.did)}
        name="My workspace"
        avatar={<Avatar name={account.name} src={account.avatarUrl} size="sm" />}
        secondary="Personal"
        current={current === account.did}
        onNavigate={onNavigate}
      />
      {organizations.isPending ? (
        <li className="menu-row">
          <Skeleton variant="text" lines={2} />
        </li>
      ) : organizations.isError ? (
        <li className="menu-row">
          <Text size="body-sm" tone="muted">
            Your organizations can't be loaded right now.
          </Text>
        </li>
      ) : (
        organizations.data.map((organization) => (
          <WorkspaceRow
            key={organization.did}
            href={workspaceHref(organization.did)}
            name={organization.name}
            avatar={<Avatar name={organization.name} src={organization.avatarUrl} size="sm" />}
            secondary={organization.roleLabel}
            current={current === organization.did}
            onNavigate={onNavigate}
          />
        ))
      )}
    </ul>
  );
}

function WorkspaceRow({
  href,
  name,
  avatar,
  secondary,
  current,
  onNavigate,
}: {
  href: string;
  name: string;
  avatar: ReactNode;
  secondary: string;
  current: boolean;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        className="menu-row"
        aria-current={current ? "page" : undefined}
        onClick={onNavigate}
      >
        {avatar}
        <span className="menu-row-text">
          <Text as="span" size="body-sm" tone="ink">
            {name}
          </Text>
          <Text as="span" size="micro" tone="muted">
            {secondary}
          </Text>
        </span>
        {current && <Check size={16} aria-label="Current workspace" />}
      </Link>
    </li>
  );
}

function DesktopWorkspaceMenu({ account, pathname }: { account: Account; pathname: string }) {
  const [open, setOpen] = useState(false);
  const current = currentWorkspace(pathname, account);
  const organizations = useOrganizations();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="nav-link" data-current={current ? "" : undefined}>
        <FolderOpen size={18} strokeWidth={1.5} aria-hidden />
        Workspace
        <ChevronDown size={14} aria-hidden />
      </PopoverTrigger>
      <PopoverContent label="Workspaces" className="menu-panel">
        <WorkspaceList
          account={account}
          current={current}
          organizations={organizations}
          onNavigate={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function PhoneWorkspaceTab({ account, pathname }: { account: Account; pathname: string }) {
  const [open, setOpen] = useState(false);
  const current = currentWorkspace(pathname, account);
  const organizations = useOrganizations();
  return (
    <>
      <button
        type="button"
        className="bottom-nav-item"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-current={current ? "page" : undefined}
        onClick={() => setOpen(true)}
      >
        <FolderOpen size={22} strokeWidth={1.5} aria-hidden />
        Workspace
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Workspaces">
        <WorkspaceList
          account={account}
          current={current}
          organizations={organizations}
          onNavigate={() => setOpen(false)}
        />
      </BottomSheet>
    </>
  );
}

// Account -------------------------------------------------------------------

/** Always about you, the person signed in, whichever workspace is open. */
function AccountMenuContent({ account, onNavigate }: { account: Account; onNavigate: () => void }) {
  return (
    <div className="menu-list">
      <div className="menu-row menu-row-static">
        <Avatar name={account.name} src={account.avatarUrl} size="md" />
        <span className="menu-row-text">
          <Text as="span" tone="ink" className="account-name">
            <ProfileName did={account.did} rendered={account.profile} />
          </Text>
          {account.handle && (
            <Text as="span" size="body-sm" tone="muted">
              @{account.handle}
            </Text>
          )}
        </span>
      </div>
      <Link href={actorHref(account.did)} className="menu-row" onClick={onNavigate}>
        <UserRound size={16} aria-hidden />
        View profile
      </Link>
      <Link href="/settings" className="menu-row" onClick={onNavigate}>
        <Settings size={16} aria-hidden />
        Settings
      </Link>
      <SignOutForm buttonClassName="menu-row">
        <LogOut size={16} aria-hidden />
        Sign out
      </SignOutForm>
    </div>
  );
}

function DesktopAccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} className="desktop-only">
      <PopoverTrigger className="account-button" aria-label={`${account.name}, account menu`}>
        <Avatar name={account.name} src={account.avatarUrl} size="sm" />
        <span className="account-button-meta" aria-hidden>
          <span className="account-button-name ellipsis">
            <ProfileName did={account.did} rendered={account.profile} />
          </span>
          {account.handle && (
            <span className="account-button-handle ellipsis">@{account.handle}</span>
          )}
        </span>
        <ChevronDown size={14} aria-hidden />
      </PopoverTrigger>
      <PopoverContent label="Account" align="end" className="menu-panel">
        <AccountMenuContent account={account} onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function PhoneAccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="account-button phone-only"
        aria-label={`${account.name}, account menu`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Avatar name={account.name} src={account.avatarUrl} size="sm" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Account">
        <AccountMenuContent account={account} onNavigate={() => setOpen(false)} />
      </BottomSheet>
    </>
  );
}
