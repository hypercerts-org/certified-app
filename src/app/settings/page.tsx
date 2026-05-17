"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
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
// page. Dynamic-import them so the landing bundle stays slim. Unlike
// the previous swap layout, every section is now rendered at once —
// dynamic-import is still useful so each panel's JS is code-split.
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
 * Categories rendered in the slim left pane. The hash drives the anchor
 * target (`/settings#username`) and each section is rendered inline in
 * the main pane — the left rail is now a scroll-spy nav rather than a
 * tab strip.
 *
 * `key` doubles as the URL hash AND the section element `id`. `Icon`
 * is a lucide-react component rendered inside the menu item's leading
 * slot. The first entry is the section the page lands on when no hash
 * is present.
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

function readHashCategory(): CategoryKey | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "").toLowerCase();
  const match = CATEGORIES.find((c) => c.key === raw);
  return match ? match.key : null;
}

/**
 * Settings page.
 *
 * Two-pane layout (mirrors the profile page):
 *   - Left pane (296px on ≥800px): vertical scroll-spy nav of section
 *     anchors. The section currently in view gets the "active" pill.
 *   - Right pane (fluid): renders ALL sections stacked vertically,
 *     each with its own anchor `id` so the left rail can scroll to it.
 *
 * Deep links (`#username`, `#email`, `#password`, `#appearance`) jump
 * to the relevant section on mount; clicking a left-rail item is just
 * a normal anchor click that scrolls (and we update history with
 * replaceState so the back-button doesn't accumulate per click).
 *
 * Org short-circuit: when an org is active in the org switcher the
 * page renders `<OrgSettings>` exactly as before; this redesign only
 * affects the personal-settings codepath.
 */
export default function SettingsPage() {
  const { did, pdsUrl } = useAuth();
  const { handle, email } = useSession();
  const { activeOrg } = useOrg();

  // The "Settings" tab in the top-bar row 2 is the active page label,
  // so the breadcrumb only carries the user's `@handle` (no redundant
  // "Settings" segment). `usePageTitle` still seeds an aria/document
  // title so screen readers and the browser tab stay correct.
  usePageTitle("Settings");
  usePageTitleBreadcrumb(
    handle
      ? {
          left: { text: handle, href: `/profile/${handle}` },
        }
      : null,
  );

  // Which section is currently "active" in the left rail. Driven by
  // IntersectionObserver below; seeded with the default so SSR and the
  // first paint agree on a single highlighted item.
  const [active, setActive] = useState<CategoryKey>(DEFAULT_CATEGORY);

  // Refs to each section element so the IntersectionObserver can watch
  // them. Keyed by category key; populated via the ref callback on each
  // <section>.
  const sectionRefs = useRef<Map<CategoryKey, HTMLElement>>(new Map());

  // Deep-link scroll on mount. Browsers usually handle `location.hash`
  // on initial navigation, but the section element doesn't exist until
  // after this component mounts (and dynamic imports may still be
  // resolving). We re-trigger the scroll explicitly so visiting
  // `/settings#email` reliably lands on the Email section.
  useEffect(() => {
    const initial = readHashCategory();
    if (initial) {
      setActive(initial);
      // rAF so the browser has laid out the sections (incl. their
      // `scroll-margin-top`) before we attempt the jump.
      requestAnimationFrame(() => {
        const el = sectionRefs.current.get(initial);
        if (el) el.scrollIntoView({ block: "start", behavior: "auto" });
      });
    }
  }, []);

  // Scroll-spy. A single IntersectionObserver watches all four section
  // elements. The `rootMargin` pulls the "viewport" inward from the top
  // by ~30% so a section becomes "active" as its title approaches the
  // sticky top bar, not only once it crosses dead-center. The bottom
  // margin is also negative so multiple short sections don't all stay
  // simultaneously intersecting.
  //
  // When multiple sections are intersecting at once (which happens
  // briefly while scrolling, and always for the short Appearance card),
  // we pick the one whose top is closest to — but not below — the
  // viewport top. That matches user intuition: "the section I'm reading".
  useEffect(() => {
    const els = Array.from(sectionRefs.current.entries());
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      () => {
        // Recompute the active section from scratch on every callback.
        // Cheaper than maintaining a running set, and avoids drift when
        // an entry that already fired "leaving" gets clobbered by a
        // later "entering" callback for the same scroll tick.
        let best: { key: CategoryKey; top: number } | null = null;
        for (const [key, el] of sectionRefs.current.entries()) {
          const rect = el.getBoundingClientRect();
          // We want the topmost section whose top edge is at or above
          // the scroll-spy line (which we approximate as the top of the
          // viewport plus the sticky top-bar height). If everything is
          // below that line — e.g. you've scrolled to the very top —
          // fall back to the first section.
          if (rect.top <= 120) {
            if (!best || rect.top > best.top) {
              best = { key, top: rect.top };
            }
          }
        }
        if (best) {
          setActive(best.key);
        } else {
          // Above all sections — highlight the first.
          setActive(CATEGORIES[0].key);
        }
      },
      {
        // Generous negative top margin so the highlight switches as the
        // next section's title gets near the sticky bar. Negative
        // bottom margin keeps only one "in-view" section at a time on
        // tall viewports.
        rootMargin: "-15% 0px -60% 0px",
        threshold: [0, 0.1, 0.5, 1],
      },
    );

    for (const [, el] of els) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Menu-item click. Let the browser do the actual smooth-scroll (an
  // anchor `<a href="#id">` already does this natively, including
  // honouring `scroll-margin-top`), but suppress the default history
  // push so the back button doesn't accumulate one entry per click.
  // We use replaceState rather than nothing so deep-link URLs still
  // reflect the user's current section if they copy it.
  const onMenuClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, key: CategoryKey) => {
      // Preserve middle-click / cmd-click semantics.
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      e.preventDefault();
      const el = sectionRefs.current.get(key);
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
        // Briefly highlight the jumped-to section so the eye lands on
        // the right place. The class auto-removes after the keyframe
        // animation finishes (1.4s in `settings-page.css`).
        el.classList.remove("sx-section--flash");
        // Force a reflow so re-adding the class restarts the animation.
        void el.offsetWidth;
        el.classList.add("sx-section--flash");
        window.setTimeout(() => el.classList.remove("sx-section--flash"), 1500);
      }
      if (typeof window !== "undefined") {
        const next = `#${key}`;
        if (window.location.hash !== next) {
          window.history.replaceState(null, "", next);
        }
      }
      // Optimistically update active state — the IntersectionObserver
      // will reconfirm once the smooth-scroll lands, but updating
      // immediately avoids a beat of stale highlight.
      setActive(key);
    },
    [],
  );

  // Ref callback factory. We can't use a single `useRef` per section
  // because the keys are dynamic; instead each <section> registers
  // itself into the Map by key.
  const setSectionRef = useCallback(
    (key: CategoryKey) => (el: HTMLElement | null) => {
      if (el) {
        sectionRefs.current.set(key, el);
      } else {
        sectionRefs.current.delete(key);
      }
    },
    [],
  );

  // Acting-as-group short-circuit. Render the org's settings UI in
  // place of the personal settings layout. Unchanged from previous page.
  if (activeOrg) {
    return <OrgSettings groupDid={activeOrg.groupDid} org={activeOrg} />;
  }

  return (
    <div className="sx sx--wide">
      <h1 className="sx__heading sr-only">Settings</h1>

      <div className="sx__layout">
        {/* Left pane — scroll-spy nav. The `<nav>` element rather than
            `tablist` because these are real anchor links now, not a
            tab strip. */}
        <aside className="sx__menu">
          <nav aria-label="Settings sections">
            <ul className="sx-menu">
              {CATEGORIES.map((cat) => {
                const isActive = cat.key === active;
                const Icon = cat.Icon;
                return (
                  <li key={cat.key}>
                    <a
                      href={`#${cat.key}`}
                      aria-current={isActive ? "true" : undefined}
                      className={`sx-menu__item${isActive ? " sx-menu__item--active" : ""}`}
                      onClick={(e) => onMenuClick(e, cat.key)}
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
          </nav>
        </aside>

        {/* Right pane — ALL sections stacked. Each section carries the
            category key as both its DOM `id` (for anchor scrolling) and
            its `aria-labelledby` target (the h2 inside it). */}
        <div className="sx__panel">
          {CATEGORIES.map((cat) => (
            <section
              key={cat.key}
              id={cat.key}
              ref={setSectionRef(cat.key)}
              className="sx-section"
              aria-labelledby={`sx-section-${cat.key}-title`}
            >
              <header className="sx-panel__header">
                <h2
                  id={`sx-section-${cat.key}-title`}
                  className="sx-panel__title"
                >
                  {cat.label}
                </h2>
                <p className="sx-panel__desc">{cat.description}</p>
              </header>

              <div className="sx-panel__body">
                {cat.key === "username" && (
                  <UsernameCard
                    handle={handle}
                    pdsUrl={pdsUrl || undefined}
                    did={did || undefined}
                  />
                )}
                {cat.key === "email" && (
                  <EmailSection email={email || ""} />
                )}
                {cat.key === "password" && (
                  <PasswordSection email={email || ""} />
                )}
                {cat.key === "appearance" && <ThemeToggle />}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
