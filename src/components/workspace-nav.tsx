"use client";

import { BottomSheet } from "@hypercerts-org/ui-react";
import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, use, useMemo, useState } from "react";
import { LinkPending } from "@/components/link-pending";
import { PageTitle } from "@/components/page-title";
import { WORKSPACE_SECTIONS } from "@/components/workspace-sections";

// The workspace's sections below 64rem, where the app sidebar (which lists
// them from 64rem) gives way to the top bar and, on phones, the tab bar. The
// section's title is the switcher: "Endorsements ⌄" opens a sheet with every
// section, the open one checked. One row of controls, nothing scrolling
// sideways, every section two taps away, like the account menu's sheet.
// Help and Settings aren't repeated here: Settings is in the account menu,
// the documentation in the footer.

const SwitcherContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

/** Around the workspace: lets its title (in the page) open its sections (in the layout). */
export function WorkspaceNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <SwitcherContext value={value}>{children}</SwitcherContext>;
}

/**
 * A workspace section's title, its one h1. Below 64rem it is also the button
 * that opens the sections; wider, plain text (the sidebar lists them).
 */
export function WorkspaceTitle({ children }: { children: ReactNode }) {
  const switcher = use(SwitcherContext);
  return (
    <PageTitle className="workspace-title">
      {switcher ? (
        <>
          <span className="workspace-title-text">{children}</span>
          <button
            type="button"
            className="workspace-switch"
            aria-haspopup="dialog"
            aria-expanded={switcher.open}
            onClick={() => switcher.setOpen(true)}
          >
            {children}
            <span className="visually-hidden">, workspace sections</span>
            <ChevronDown
              size={24}
              strokeWidth={1.75}
              aria-hidden
              className="workspace-switch-icon"
            />
          </button>
        </>
      ) : (
        children
      )}
    </PageTitle>
  );
}

/** `overview` is the workspace's own address. */
export function WorkspaceNav({
  overview,
  badgesBadge,
}: {
  overview: string;
  badgesBadge?: ReactNode;
}) {
  return (
    <WorkspaceNavView
      overview={overview}
      pathname={decodeURIComponent(usePathname())}
      badgesBadge={badgesBadge}
    />
  );
}

/** The sections' sheet for a known path; with no path (before the URL is read), nothing is checked. */
export function WorkspaceNavView({
  overview,
  pathname,
  badgesBadge,
}: {
  overview: string;
  pathname?: string;
  badgesBadge?: ReactNode;
}) {
  const switcher = use(SwitcherContext);
  if (!switcher) return null;
  const close = () => switcher.setOpen(false);
  return (
    <BottomSheet open={switcher.open} onClose={close} title="Workspace">
      <nav aria-label="Workspace">
        <ul className="menu-list">
          {WORKSPACE_SECTIONS.map(({ label, icon: Icon, path }) => {
            const current =
              pathname === `${overview}${path}` ||
              (path !== "" && pathname?.startsWith(`${overview}${path}/`));
            return (
              <li key={label}>
                <Link
                  prefetch
                  href={`${overview}${path}`}
                  className="menu-row"
                  aria-current={current ? "page" : undefined}
                  onClick={close}
                >
                  <Icon size={20} strokeWidth={1.5} aria-hidden />
                  <span className="menu-row-text">{label}</span>
                  {path === "/badges" && badgesBadge}
                  {current && <Check size={16} aria-hidden />}
                  <LinkPending />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </BottomSheet>
  );
}
