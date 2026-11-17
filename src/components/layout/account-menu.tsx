"use client"

import { useMemo } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { sortGroupsForSwitcher } from "@/lib/groups/navigation"
import type { OrgRole } from "@/lib/groups/types"
import { useOrgProfile } from "@/hooks/use-org-profile"
import { useProfile } from "@/hooks/use-profile"
import { useSession } from "@/hooks/use-session"
import { ownProfileUrl } from "@/lib/urls"
import { getInitials } from "@/lib/utils/initials"
import Avatar from "@/components/ui/avatar"
import { ORG_ROLE_LABEL } from "./role-label"

// ---------------------------------------------------------------------------
// Who is signed in, and who they act as
// ---------------------------------------------------------------------------

export interface AccountIdentity {
  /** "personal": the signed-in person. "group": a group they act as.
   *  "group-account": the signed-in account is itself a group. */
  kind: "personal" | "group" | "group-account"
  name: string
  handle: string | null
  avatarUrl?: string
  initials: string
  seed?: string
  role?: OrgRole
}

const ROLE_LABEL = ORG_ROLE_LABEL

/** The tag under the current account's name: "Personal" or "Group · Admin". */
export function identityTag(identity: Pick<AccountIdentity, "kind" | "role">): string {
  if (identity.kind === "personal") return "Personal"
  if (identity.kind === "group-account") return "Group account"
  return identity.role ? `Group · ${ROLE_LABEL[identity.role]}` : "Group"
}

/**
 * The signed-in account and who it acts as: `personal` (the person signed
 * in) and `current` (the personal account, or the group acted as; what
 * the account control shows), the groups to switch between (sorted), and
 * the personal profile link. The account control and its menu live in
 * account-switcher.tsx.
 */
export function useAccountState() {
  const { did } = useAuth()
  const { profile, avatarUrl } = useProfile()
  const { handle } = useSession()
  const { activeOrg, groups, selfGroup } = useOrg()
  const { orgAvatarUrl } = useOrgProfile()
  const sortedGroups = useMemo(() => sortGroupsForSwitcher(groups), [groups])

  const personal: AccountIdentity = {
    kind: selfGroup ? "group-account" : "personal",
    name: profile?.displayName || handle || "Your account",
    handle: handle ?? null,
    avatarUrl: avatarUrl || undefined,
    // Nothing to show until the name or handle has loaded: the plain fill,
    // not a "?" that reads like an error or a help button.
    initials: profile?.displayName || handle ? getInitials(profile?.displayName, handle) : "",
    seed: did ?? undefined,
    role: selfGroup?.role,
  }

  const current: AccountIdentity = activeOrg
    ? {
        kind: "group",
        name: activeOrg.displayName || activeOrg.handle,
        handle: activeOrg.handle,
        avatarUrl: orgAvatarUrl || activeOrg.avatarUrl || undefined,
        initials: getInitials(activeOrg.displayName, activeOrg.handle),
        seed: activeOrg.groupDid,
        role: activeOrg.role,
      }
    : personal

  // The account menu's "View profile": always your own profile, whichever
  // workspace is open.
  const profileHref = ownProfileUrl({
    activeGroup: null,
    personalHandle: handle,
    personalDid: did,
  })

  return { personal, current, groups: sortedGroups, activeOrg, selfGroup, profileHref }
}

/** An account's avatar: round for a person, square for a group. */
export function IdentityAvatar({
  identity,
  size,
}: {
  identity: AccountIdentity
  size: "2xs" | "xs" | "sm" | "md"
}) {
  return (
    <Avatar
      size={size}
      shape={identity.kind === "personal" ? "circle" : "square"}
      src={identity.avatarUrl}
      fallbackInitials={identity.initials}
      seed={identity.seed}
    />
  )
}
