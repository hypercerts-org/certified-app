"use client";

import React, { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  AtSign,
  KeyRound,
  Mail,
  Palette,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import {
  usePageTitle,
  usePageTitleBreadcrumb,
} from "@/lib/navbar-context";
import OrgSettings from "@/components/groups/org-settings";
import ThemeToggle from "@/components/ui/theme-toggle";

// The category panels are still legacy components hoisted into this
// page. Dynamic-import them so the landing bundle stays slim — only the
// active category's panel pays its load cost.
const UsernameCard = dynamic(
  () => import("@/components/dashboard/username-card"),
);
const EmailSection = dynamic(
  () => import("@/components/account/email-section"),
);
const PasswordSection = dynamic(
  () => import("@/components/account/password-section"),
);

/**
 * Categories rendered in the slim left pane. The hash drives selection
 * (`/settings#username`) so each category has a stable deep-link URL.
 * Order here is the order shown in the menu; the first entry is the
 * default when no hash is present.
 *
 * `key` doubles as the URL hash. `Icon` is a lucide-react component
 * rendered inside the menu item's leading slot.
 *
 * Note: "Edit profile" was deliberately dropped from the categories
 * list — profile editing has moved to an inline-edit flow on the
 * profile page itself. The `/settings/edit-profile` route is kept as
 * a fallback by the layout in `edit-profile/page.tsx` but is no longer
 * surfaced from this menu.
 */
type CategoryKey = "username" | "email" | "password" | "appearance";

type CategoryDef = {
  key: CategoryKey;
  label: string;
  description: string;
  Icon: typeof AtSign;
};

const CATEGORIES: CategoryDef[] = [
  {
    key: "username",
    label: "Username",
    description: "The @handle people use to find you on Certified.",
    Icon: AtSign,
  },
  {
    key: "email",
    label: "Email",
    description: "Used to sign in and recover your account.",
    Icon: Mail,
  },
  {
    key: "password",
    label: "Password",
    description: "Reset the password used to sign in to this account.",
    Icon: KeyRound,
  },
  {
    key: "appearance",
    label: "Appearance",
    description: "Light or dark theme — or match your system preference.",
    Icon: Palette,
  },
];

const DEFAULT_CATEGORY: CategoryKey = CATEGORIES[0].key;

function readHashCategory(): CategoryKey {
  if (typeof window === "undefined") return DEFAULT_CATEGORY;
  const raw = window.location.hash.replace(/^#/, "").toLowerCase();
  const match = CATEGORIES.find((c) => c.key === raw);
  return match ? match.key : DEFAULT_CATEGORY;
}

/**
 * Settings page.
 *
 * Two-pane layout (mirrors the profile page):
 *   - Left pane (296px on ≥800px): vertical menu of categories. The
 *     active item gets a subtle pill background.
 *   - Right pane (fluid): renders the selected category's UI.
 *
 * Selection is hash-driven (`#username`, `#email`, `#password`,
 * `#appearance`). On mobile (<800px) the menu stacks on top of the
 * panel — same responsive pattern as the profile page.
 *
 * Org short-circuit: when an org is active in the org switcher the
 * page renders `<OrgSettings>` exactly as before; this redesign only
 * affects the personal-settings codepath.
 */
export default function SettingsPage() {
  const { did, pdsUrl } = useAuth();
  const { handle, email } = useSession();
  const { activeOrg } = useOrg();

  // Navbar breadcrumb: `@handle` › `Settings`. Until handle resolves we
  // pass `null` so the navbar isn't briefly empty.
  usePageTitle("Settings");
  usePageTitleBreadcrumb(
    handle
      ? {
          left: { text: `@${handle}`, href: `/profile/${handle}` },
          right: { text: "Settings", href: "/settings" },
        }
      : null,
  );

  // Hash-based selection. We read the initial hash on mount (SSR-safe
  // default first), then subscribe to `hashchange` so deep-linking and
  // the user's back/forward buttons both stay in sync.
  const [active, setActive] = useState<CategoryKey>(DEFAULT_CATEGORY);

  useEffect(() => {
    setActive(readHashCategory());
    const onHashChange = () => setActive(readHashCategory());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Menu-item click. We update the hash via history.replaceState so the
  // back button doesn't accumulate one entry per click — same UX as
  // tab strips. We then drive React state manually since replaceState
  // doesn't fire `hashchange`.
  const selectCategory = useCallback((key: CategoryKey) => {
    if (typeof window !== "undefined") {
      const next = `#${key}`;
      if (window.location.hash !== next) {
        window.history.replaceState(null, "", next);
      }
    }
    setActive(key);
  }, []);

  // Acting-as-group short-circuit. Render the org's settings UI in
  // place of the personal settings layout. Unchanged from previous page.
  if (activeOrg) {
    return <OrgSettings groupDid={activeOrg.groupDid} org={activeOrg} />;
  }

  const activeDef =
    CATEGORIES.find((c) => c.key === active) ?? CATEGORIES[0];

  return (
    <div className="sx sx--wide">
      <h1 className="sx__heading sr-only">Settings</h1>

      <div className="sx__layout">
        {/* Left pane — slim menu. role=tablist so screen readers treat
            the items as a tab strip; each item is role=tab. */}
        <aside className="sx__menu" role="tablist" aria-label="Settings categories">
          <ul className="sx-menu">
            {CATEGORIES.map((cat) => {
              const isActive = cat.key === activeDef.key;
              const Icon = cat.Icon;
              return (
                <li key={cat.key}>
                  <a
                    href={`#${cat.key}`}
                    role="tab"
                    id={`sx-tab-${cat.key}`}
                    aria-selected={isActive}
                    aria-controls={`sx-panel-${cat.key}`}
                    className={`sx-menu__item${isActive ? " sx-menu__item--active" : ""}`}
                    onClick={(e) => {
                      // Preserve middle-click / cmd-click semantics; only
                      // intercept the plain left-click case.
                      if (
                        e.button === 0 &&
                        !e.metaKey &&
                        !e.ctrlKey &&
                        !e.shiftKey &&
                        !e.altKey
                      ) {
                        e.preventDefault();
                        selectCategory(cat.key);
                      }
                    }}
                  >
                    <span className="sx-menu__icon" aria-hidden>
                      <Icon size={16} strokeWidth={1.75} />
                    </span>
                    <span className="sx-menu__label">{cat.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Right pane — the selected category's panel. We render only
            the active panel rather than all panels hidden by CSS so
            heavy editors (email/password) don't run their effects when
            the user isn't looking at them. */}
        <section
          className="sx__panel"
          role="tabpanel"
          id={`sx-panel-${activeDef.key}`}
          aria-labelledby={`sx-tab-${activeDef.key}`}
        >
          <header className="sx-panel__header">
            <h2 className="sx-panel__title">{activeDef.label}</h2>
            <p className="sx-panel__desc">{activeDef.description}</p>
          </header>

          <div className="sx-panel__body">
            {activeDef.key === "username" && (
              <UsernameCard
                handle={handle}
                pdsUrl={pdsUrl || undefined}
                did={did || undefined}
              />
            )}
            {activeDef.key === "email" && (
              <EmailSection email={email || ""} />
            )}
            {activeDef.key === "password" && (
              <PasswordSection email={email || ""} />
            )}
            {activeDef.key === "appearance" && <ThemeToggle />}
          </div>
        </section>
      </div>
    </div>
  );
}
