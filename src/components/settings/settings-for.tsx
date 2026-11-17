"use client"

import { useAuth } from "@/lib/auth/auth-context"
import type { Group } from "@/lib/groups/types"
import { IdentityAvatar } from "@/components/layout/account-menu"
import { groupIdentity, useWorkspaceState } from "@/components/layout/workspace-menu"

/**
 * "for [avatar] Name", right after the Settings title: whose settings
 * these are, yours or one of your groups'. A label, not a picker: the
 * account control (who you act as) decides whose settings you open, so
 * there is one place to choose. Shown only with something to tell apart
 * (signed in and in at least one group).
 */
export default function SettingsFor({ account }: { account: Group | null }) {
  const { isAuthenticated } = useAuth()
  const { personal, canSwitch } = useWorkspaceState()
  if (!isAuthenticated || !canSwitch) return null
  const identity = account ? groupIdentity(account) : personal
  return (
    <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5 text-caption font-medium text-[var(--fg-primary)]">
      <span className="font-normal text-[var(--fg-muted)]">for</span>
      <IdentityAvatar identity={identity} size="xs" />
      <span className="max-w-[200px] truncate">{identity.name}</span>
    </span>
  )
}
