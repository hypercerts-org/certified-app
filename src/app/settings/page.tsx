"use client";

import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  AtSign,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Mail,
  Palette,
  UserPen,
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

// The existing inline-control components are still rendered on this
// landing page since they don't yet have dedicated sub-routes (see the
// TODOs below). Dynamic-import them so we don't bloat the landing
// bundle when a future PR promotes them to their own /settings/*
// pages.
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
 * Settings landing page.
 *
 * Renders inside `.app-shell__content` (the 600px reading column shared
 * with `/settings/edit-profile`). Visually a list of category rows in
 * the GitHub Settings landing pattern: icon + label + short description
 * + chevron-link to a sub-route.
 *
 * TODO(settings-subroutes): only `Edit profile` is wired to a real
 * sub-route today. Username, Email, Password, and Appearance still live
 * inline on this page using their legacy components. Each is a candidate
 * for promotion to its own page:
 *   - /settings/username   ← `<UsernameCard />`
 *   - /settings/email      ← `<EmailSection />`
 *   - /settings/password   ← `<PasswordSection />`
 *   - /settings/appearance ← `<ThemeToggle />`
 * Once those pages exist, swap the inline `.sx-row--inline` rows below
 * for `.sx-row--link` rows pointing at them.
 *
 * Note: when an org is active in the org switcher we short-circuit to
 * `OrgSettings`, preserving the previous page's behaviour. The org's
 * own settings page lives under `/groups/[groupDid]/settings`.
 */
export default function SettingsPage() {
  const { did, pdsUrl } = useAuth();
  const { handle, email } = useSession();
  const { activeOrg } = useOrg();

  // Drive the navbar breadcrumb the same way edit-profile does. While
  // the handle hasn't loaded we fall through to the plain string title
  // so the navbar isn't briefly empty.
  usePageTitle("Settings");
  usePageTitleBreadcrumb(
    handle
      ? {
          left: { text: `@${handle}`, href: `/profile/${handle}` },
          right: { text: "Settings", href: "/settings" },
        }
      : null,
  );

  // Acting-as-group short-circuit: render the org's settings UI in
  // place of the personal settings list. Mirrors the previous page.
  if (activeOrg) {
    return <OrgSettings groupDid={activeOrg.groupDid} org={activeOrg} />;
  }

  const profileHref = handle ? `/profile/${handle}` : "/profile";

  return (
    <div className="sx">
      {/* Back-to-@handle. Mirrors the edit-profile page's affordance so
          both settings pages exit the same way. */}
      <div className="sx__back">
        <Link href={profileHref} className="sx__back-link">
          <ChevronLeft size={14} strokeWidth={2} aria-hidden />
          <span>
            Back to{" "}
            <span className="sx__back-handle">@{handle ?? "profile"}</span>
          </span>
        </Link>
      </div>

      <h1 className="sx__heading">Settings</h1>
      <p className="sx__lead">
        Manage your profile, account, and how Certified looks.
      </p>

      {/* Ungrouped — single item: Profile. Per the brief, groups only
          warrant a header when they hold 2+ items. */}
      <section className="sx__section">
        <ul className="sx__list">
          <li>
            <Link href="/settings/edit-profile" className="sx-row sx-row--link">
              <span className="sx-row__icon" aria-hidden>
                <UserPen size={16} strokeWidth={1.75} />
              </span>
              <span className="sx-row__body">
                <span className="sx-row__title">Edit profile</span>
                <span className="sx-row__desc">
                  Display name, bio, avatar, banner, and website.
                </span>
              </span>
              <ChevronRight
                size={16}
                strokeWidth={1.75}
                className="sx-row__chevron"
                aria-hidden
              />
            </Link>
          </li>
        </ul>
      </section>

      {/* Account group — 3 inline items. These will become linked rows
          once /settings/username, /settings/email, /settings/password
          exist. Today the legacy inline editors render in place. */}
      <section className="sx__section">
        <h2 className="sx__section-title">Account</h2>
        <ul className="sx__list">
          {/* TODO(settings-subroutes): promote to /settings/username */}
          <li>
            <div className="sx-row sx-row--inline">
              <span className="sx-row__icon" aria-hidden>
                <AtSign size={16} strokeWidth={1.75} />
              </span>
              <div className="sx-row__body">
                <span className="sx-row__title">Username</span>
                <span className="sx-row__desc">
                  The @handle people use to find you on Certified.
                </span>
                <div className="sx-row__control">
                  <UsernameCard
                    handle={handle}
                    pdsUrl={pdsUrl || undefined}
                    did={did || undefined}
                  />
                </div>
              </div>
            </div>
          </li>

          {/* TODO(settings-subroutes): promote to /settings/email */}
          <li>
            <div className="sx-row sx-row--inline">
              <span className="sx-row__icon" aria-hidden>
                <Mail size={16} strokeWidth={1.75} />
              </span>
              <div className="sx-row__body">
                <span className="sx-row__title">Email address</span>
                <span className="sx-row__desc">
                  Used to sign in and recover your account.
                </span>
                <div className="sx-row__control">
                  <EmailSection email={email || ""} />
                </div>
              </div>
            </div>
          </li>

          {/* TODO(settings-subroutes): promote to /settings/password */}
          <li>
            <div className="sx-row sx-row--inline">
              <span className="sx-row__icon" aria-hidden>
                <KeyRound size={16} strokeWidth={1.75} />
              </span>
              <div className="sx-row__body">
                <span className="sx-row__title">Password</span>
                <span className="sx-row__desc">
                  Reset the password used to sign in to this account.
                </span>
                <div className="sx-row__control">
                  <PasswordSection email={email || ""} />
                </div>
              </div>
            </div>
          </li>
        </ul>
      </section>

      {/* Ungrouped — single item: Appearance. */}
      <section className="sx__section">
        {/* TODO(settings-subroutes): promote to /settings/appearance */}
        <ul className="sx__list">
          <li>
            <div className="sx-row sx-row--inline">
              <span className="sx-row__icon" aria-hidden>
                <Palette size={16} strokeWidth={1.75} />
              </span>
              <div className="sx-row__body">
                <span className="sx-row__title">Appearance</span>
                <span className="sx-row__desc">
                  Light or dark theme — or match your system preference.
                </span>
                <div className="sx-row__control">
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}
