"use client"

import AccountPicker from "@/components/layout/account-picker"
import { useSeenAs } from "@/lib/groups/seen-as"

/**
 * "Seen as", right after the Feed and Explore titles: which account the
 * network is shown for, you ("Me") or one of your groups, and a way to
 * switch (`AccountPicker`). Its own setting (`useSeenAs`), separate from
 * the workspace: picking here never changes the workspace, and the
 * Workspace menu never changes this.
 */
export default function SeenAsSwitcher() {
  const { seenAs, setSeenAs } = useSeenAs()
  return (
    <AccountPicker
      prefix="Seen as"
      label="Seen as"
      current={seenAs}
      onSelect={setSeenAs}
      note="Changes what Feed and Explore show, not your workspace."
    />
  )
}
