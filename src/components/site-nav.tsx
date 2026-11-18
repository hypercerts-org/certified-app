"use client";

import {
  Avatar,
  BottomSheet,
  Button,
  Eyebrow,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  FolderOpen,
  Globe,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { actorHref, WORKSPACE_PATH, workspaceHref } from "@/components/cards";
import { ProfileName } from "@/components/profile-text";
import { SignInButton } from "@/components/sign-in-button";
import { SignOutForm } from "@/components/sign-out-form";
import { switchActingAs } from "@/lib/acting-as-actions";
import type { ProfileFields } from "@/lib/hypercerts/views";
import type { Organization } from "@/lib/organizations";

/** The signed-in account, as the header shows it. */
export type Account = {
  did: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  profile: ProfileFields;
  /** The organization this browser acts as, or null for the account itself. */
  actingAs: { did: string; name: string; avatarUrl: string | null } | null;
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

function useDecodedPathname() {
  return decodeURIComponent(usePathname());
}

export function SiteNav({ account }: { account: Account | null }) {
  const pathname = useDecodedPathname();
  const destinations = DESTINATIONS.filter((d) => account || !d.signedInOnly);

  return (
    <>
      <nav aria-label="Main" className="site-nav desktop-only">
        {destinations.map((destination) => (
          <Link
            key={destination.key}
            href={destination.href}
            className="nav-link"
            aria-current={destination.isActive(pathname) ? "page" : undefined}
          >
            <destination.icon size={18} strokeWidth={1.5} aria-hidden />
            {destination.label}
          </Link>
        ))}
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
        {destinations.map((destination) => (
          <Link
            key={destination.key}
            href={destination.href}
            className="bottom-nav-item"
            aria-current={destination.isActive(pathname) ? "page" : undefined}
          >
            <destination.icon size={22} strokeWidth={1.5} aria-hidden />
            {destination.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

// Account -------------------------------------------------------------------

async function fetchOrganizations(): Promise<Organization[]> {
  const response = await fetch("/api/me/organizations");
  if (!response.ok) throw new Error(`Organizations request failed: ${response.status}`);
  return ((await response.json()) as { organizations: Organization[] }).organizations;
}

/**
 * Your organizations, loaded as soon as the header shows (not when the menu
 * opens), so the list is complete by the time it does. Kept for five minutes,
 * like the server's cache of them.
 */
function useOrganizations() {
  return useQuery({
    queryKey: ["me", "organizations"],
    queryFn: fetchOrganizations,
    staleTime: 5 * 60_000,
  });
}

/** An identity you can act as: you, or an organization you belong to. */
type Identity = { did: string; name: string; avatarUrl: string | null };

/** Whom the header shows: the organization you act as, or you. */
function current(account: Account): Identity {
  return account.actingAs ?? { did: account.did, name: account.name, avatarUrl: account.avatarUrl };
}

/** "@you", or "via @you" while acting as an organization. */
function byline(account: Account): string | null {
  const you = account.handle ? `@${account.handle}` : account.actingAs ? account.name : null;
  return account.actingAs && you ? `via ${you}` : you;
}

/**
 * Switches whom you act as, then says so in a toast with Go to workspace and
 * Undo. The Server Action refreshes the page, so it renders as the new
 * identity; on a workspace page, you move to the new identity's workspace.
 */
function useSwitchActingAs(account: Account) {
  const router = useRouter();
  const pathname = useDecodedPathname();
  const [, startTransition] = useTransition();

  const toWorkspace = (did: string) => router.push(workspaceHref(did));

  const switchTo = (target: Identity, previous: Identity | null) =>
    startTransition(async () => {
      const result = await switchActingAs(target.did);
      if (!result.ok) {
        toast.error(`Couldn't switch to ${target.name}. Try again.`);
        return;
      }
      if (WORKSPACE_PATH.test(pathname)) toWorkspace(target.did);
      if (!previous) {
        toast(`Switched back to ${target.name}`);
        return;
      }
      toast.custom(
        (id) => (
          <SwitchedToast
            identity={target}
            self={target.did === account.did}
            onDismiss={() => toast.dismiss(id)}
            onWorkspace={() => {
              toast.dismiss(id);
              toWorkspace(target.did);
            }}
            onUndo={() => {
              toast.dismiss(id);
              switchTo(previous, null);
            }}
          />
        ),
        // Long enough to reach Undo; Sonner pauses it while hovered or focused.
        { duration: 10_000 },
      );
    });

  return (target: Identity) => switchTo(target, current(account));
}

function SwitchedToast({
  identity,
  self,
  onDismiss,
  onWorkspace,
  onUndo,
}: {
  identity: Identity;
  self: boolean;
  onDismiss: () => void;
  onWorkspace: () => void;
  onUndo: () => void;
}) {
  return (
    <div className="switch-toast">
      <div className="switch-toast-header">
        <Text as="span" tone="ink" className="switch-toast-title">
          Switched to {identity.name}
        </Text>
        <button
          type="button"
          className="switch-toast-close"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="switch-toast-body">
        <Avatar name={identity.name} src={identity.avatarUrl} size="md" />
        <Text as="span" size="body-sm">
          {self ? "You're now acting as yourself." : `You're now acting as ${identity.name}.`}
        </Text>
      </div>
      <div className="switch-toast-actions">
        <Button size="sm" variant="primary" onClick={onWorkspace}>
          Go to workspace
        </Button>
        <Button size="sm" variant="secondary" onClick={onUndo}>
          Undo
        </Button>
      </div>
    </div>
  );
}

/** You, then every organization you belong to; the current one checked. */
function ActAsList({
  account,
  onSwitch,
}: {
  account: Account;
  onSwitch: (target: Identity) => void;
}) {
  const labelId = useId();
  const organizations = useOrganizations();
  const activeDid = current(account).did;
  const you: Identity = { did: account.did, name: account.name, avatarUrl: account.avatarUrl };
  return (
    <>
      <Eyebrow id={labelId} className="menu-label">
        Act as
      </Eyebrow>
      <ul className="menu-list" aria-labelledby={labelId}>
        <ActAsRow
          identity={you}
          secondary="Personal"
          active={activeDid === account.did}
          onSwitch={onSwitch}
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
            <ActAsRow
              key={organization.did}
              identity={organization}
              secondary={organization.roleLabel}
              active={activeDid === organization.did}
              onSwitch={onSwitch}
            />
          ))
        )}
      </ul>
    </>
  );
}

function ActAsRow({
  identity,
  secondary,
  active,
  onSwitch,
}: {
  identity: Identity;
  secondary: string;
  active: boolean;
  onSwitch: (target: Identity) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="menu-row"
        aria-current={active ? "true" : undefined}
        disabled={active}
        onClick={() => onSwitch(identity)}
      >
        <Avatar name={identity.name} src={identity.avatarUrl} size="sm" />
        <span className="menu-row-text">
          <Text as="span" size="body-sm" tone="ink">
            {identity.name}
          </Text>
          <Text as="span" size="micro" tone="muted">
            {secondary}
          </Text>
        </span>
        {active && <Check size={16} aria-label="Current" />}
      </button>
    </li>
  );
}

function AccountMenuContent({
  account,
  onNavigate,
  onSwitch,
}: {
  account: Account;
  onNavigate: () => void;
  onSwitch: (target: Identity) => void;
}) {
  const identity = current(account);
  const subline = byline(account);
  return (
    <div className="menu-list">
      <div className="menu-row menu-row-static">
        <Avatar name={identity.name} src={identity.avatarUrl} size="md" />
        <span className="menu-row-text">
          <Text as="span" tone="ink" className="account-name">
            {account.actingAs ? (
              identity.name
            ) : (
              <ProfileName did={account.did} rendered={account.profile} />
            )}
          </Text>
          {subline && (
            <Text as="span" size="body-sm" tone="muted">
              {subline}
            </Text>
          )}
        </span>
      </div>
      <ActAsList
        account={account}
        onSwitch={(target) => {
          onNavigate();
          onSwitch(target);
        }}
      />
      <hr className="menu-separator" />
      <Link href={actorHref(identity.did)} className="menu-row" onClick={onNavigate}>
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

/** The avatar of whom you act as, with a small marker that it opens a menu. */
function AccountAvatar({ identity }: { identity: Identity }) {
  return (
    <span className="account-avatar">
      <Avatar name={identity.name} src={identity.avatarUrl} size="md" />
      <span className="account-avatar-marker" aria-hidden>
        <ChevronDown size={12} strokeWidth={2.5} />
      </span>
    </span>
  );
}

function DesktopAccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  // Loaded with the header, so the menu opens complete.
  useOrganizations();
  // Here, not in the menu, which closes before the switch completes.
  const switchTo = useSwitchActingAs(account);
  const identity = current(account);
  return (
    <Popover kind="navigation" open={open} onOpenChange={setOpen} className="desktop-only">
      <PopoverTrigger className="account-button" aria-label={`${identity.name}, account menu`}>
        <AccountAvatar identity={identity} />
      </PopoverTrigger>
      <PopoverContent label="Account" align="end" className="menu-panel">
        <AccountMenuContent
          account={account}
          onNavigate={() => setOpen(false)}
          onSwitch={switchTo}
        />
      </PopoverContent>
    </Popover>
  );
}

function PhoneAccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  useOrganizations();
  const switchTo = useSwitchActingAs(account);
  const identity = current(account);
  return (
    <>
      <button
        type="button"
        className="account-button phone-only"
        aria-label={`${identity.name}, account menu`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <AccountAvatar identity={identity} />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Account">
        <AccountMenuContent
          account={account}
          onNavigate={() => setOpen(false)}
          onSwitch={switchTo}
        />
      </BottomSheet>
    </>
  );
}

/**
 * The sidebar's account control: whom you act as (avatar, name and handle),
 * opening the same account menu as the top bar's avatar.
 */
export function SidebarAccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  useOrganizations();
  const switchTo = useSwitchActingAs(account);
  const identity = current(account);
  const subline = byline(account);
  return (
    <Popover kind="navigation" open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="sidebar-account" aria-label={`${identity.name}, account menu`}>
        <Avatar name={identity.name} src={identity.avatarUrl} size="md" />
        <span className="sidebar-account-text">
          <span className="sidebar-account-name">{identity.name}</span>
          {subline && <span className="sidebar-account-handle">{subline}</span>}
        </span>
        <ChevronsUpDown size={16} aria-hidden className="sidebar-account-chevron" />
      </PopoverTrigger>
      <PopoverContent label="Account" align="start" className="menu-panel">
        <AccountMenuContent
          account={account}
          onNavigate={() => setOpen(false)}
          onSwitch={switchTo}
        />
      </PopoverContent>
    </Popover>
  );
}
