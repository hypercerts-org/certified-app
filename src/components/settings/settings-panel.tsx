"use client"

import React from "react"
import dynamic from "next/dynamic"
import { CircleUser, Key, Palette, Share2, Users } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useOrg } from "@/lib/groups/org-context"
import { profileEditUrl } from "@/components/profile/profile-edit-url"
import SyncSocialGraphSection from "@/components/settings/sync-social-graph-section"
import ImportAsGroupSection from "@/components/settings/import-as-group-section"
import AppPasswordsSection from "@/components/settings/app-passwords-section"
import SettingsLayout, {
  SettingsBlock,
  SettingsRow,
  useHashSection,
  type SettingsSectionDef,
} from "@/components/settings/settings-layout"
import DidSection from "@/components/account/did-section"
import ThemeToggle from "@/components/ui/theme-toggle"
import Button from "@/components/ui/button"

const UsernameCard = dynamic(
  () => import("@/components/dashboard/username-card"),
)
const EmailSection = dynamic(
  () => import("@/components/account/email-section"),
)
const PasswordSection = dynamic(
  () => import("@/components/account/password-section"),
)
// Group-admin subtree (member management, group password reset) —
// only group accounts render it, so keep it out of the personal
// /settings first-load chunk.
const OrgSettings = dynamic(
  () => import("@/components/groups/org-settings"),
)

type SectionKey =
  | "account"
  | "appearance"
  | "bluesky-follows"
  | "app-passwords"
  | "group"

type SectionDef = SettingsSectionDef<SectionKey> & {
  /** The section heading; defaults to the SideNav label. */
  title?: string
  description: string
}

/**
 * Personal settings, one section at a time. The small account controls
 * share the Account section as rows; the bigger features (follow sync, app
 * passwords, turning the account into a group) are sections of their own.
 * Destructive or account-changing work sits last.
 */
const SECTIONS: SectionDef[] = [
  {
    key: "account",
    label: "Account",
    icon: CircleUser,
    description: "Your profile, handle and permanent ID, sign-in email and password.",
  },
  {
    key: "appearance",
    label: "Appearance",
    icon: Palette,
    description: "How Certified looks on this device.",
  },
  {
    key: "bluesky-follows",
    label: "Bluesky follows",
    icon: Share2,
    description:
      "Compare your Certified and Bluesky follows, and sync the ones missing on either side.",
  },
  {
    key: "app-passwords",
    label: "App passwords",
    icon: Key,
    description:
      "Passwords that let other apps sign in as you. Each is shown once, and you can revoke it any time.",
  },
  {
    key: "group",
    label: "Group account",
    icon: Users,
    description:
      "Turn this personal account into a group that several people can manage.",
  },
]

const SECTION_KEYS: readonly SectionKey[] = SECTIONS.map((s) => s.key)

/** Old deep links land on the section that now holds them: the per-field
 *  ones (#username / #email / #password) on Account, #social-graph on
 *  Bluesky follows. */
const SECTION_ALIASES: Readonly<Record<string, SectionKey>> = {
  username: "account",
  handle: "account",
  email: "account",
  password: "account",
  did: "account",
  theme: "appearance",
  // The section's earlier name (the product tour still links here).
  "social-graph": "bluesky-follows",
}

/**
 * Settings for the signed-in account. Renders on `/settings` (and the
 * legacy own-profile `?tab=settings`). While acting as a group, or when the
 * signed-in account is itself a group, it shows the group's settings.
 */
export default function SettingsPanel() {
  const { did, pdsUrl } = useAuth()
  const { handle, email } = useSession()
  const { activeOrg, selfGroup } = useOrg()
  const [active, select] = useHashSection(SECTION_KEYS, SECTION_ALIASES)

  // Acting as a group, OR the logged-in account is itself a group (you
  // promoted your own account) — either way show the group settings. For a
  // self-owned group the resolved handle can lag (DID-doc resolution), so
  // prefer the session handle (it's our own account) — otherwise settings and
  // the delete-confirm would show the raw DID instead of @handle.
  const settingsOrg =
    activeOrg ??
    (selfGroup
      ? { ...selfGroup, handle: handle || selfGroup.handle }
      : null)
  if (settingsOrg) {
    return <OrgSettings groupDid={settingsOrg.groupDid} org={settingsOrg} />
  }

  const selected = SECTIONS.find((s) => s.key === active) ?? SECTIONS[0]

  const renderBody = (key: SectionKey) => {
    switch (key) {
      case "account":
        return (
          <>
            <SettingsRow
              label="Profile"
              description="Your name, picture, bio and links, as others see them."
            >
              <Button variant="secondary" size="sm" href={profileEditUrl(handle || did || "")}>
                Edit profile
              </Button>
            </SettingsRow>
            <SettingsRow
              label="Handle"
              description="The @handle people use to find and mention you. You can change it or use your own domain."
            >
              <UsernameCard
                handle={handle}
                pdsUrl={pdsUrl || undefined}
                did={did || undefined}
              />
            </SettingsRow>
            <SettingsRow
              label="Email"
              description="Used to sign in and to recover your account."
            >
              <EmailSection email={email || ""} />
            </SettingsRow>
            <SettingsRow
              label="Password"
              description="Lets you sign in to other AT Protocol apps, like Bluesky, with your handle. Here you keep signing in with an email code."
            >
              <PasswordSection email={email || ""} />
            </SettingsRow>
            <SettingsRow
              label="Permanent ID"
              description="Your account's DID. Unlike your handle it never changes, so apps and records refer to you by it."
            >
              {/* No Edit action: the pill stops at the same right edge as
                  the handle, email and password values above. */}
              <div className="settings-field settings-field--value-only">
                <DidSection did={did || undefined} />
              </div>
            </SettingsRow>
          </>
        )
      case "appearance":
        return (
          <SettingsRow label="Theme" description="Light, dark, or follow your device.">
            <ThemeToggle variant="cards" />
          </SettingsRow>
        )
      case "bluesky-follows":
        return did ? (
          <SettingsBlock>
            <SyncSocialGraphSection did={did} ownDid={did} />
          </SettingsBlock>
        ) : null
      case "app-passwords":
        return <AppPasswordsSection />
      case "group":
        return did ? (
          <SettingsBlock>
            <ImportAsGroupSection did={did} />
          </SettingsBlock>
        ) : null
    }
  }

  return (
    <SettingsLayout
      description={
        handle ? (
          <>
            Settings for <strong className="font-medium text-[var(--fg-primary)]">@{handle}</strong>.
          </>
        ) : (
          "Settings for your account."
        )
      }
      navLabel="Settings sections"
      sections={SECTIONS}
      current={selected.key}
      onSelect={select}
      title={selected.title ?? selected.label}
      sectionDescription={selected.description}
    >
      {renderBody(selected.key)}
    </SettingsLayout>
  )
}
