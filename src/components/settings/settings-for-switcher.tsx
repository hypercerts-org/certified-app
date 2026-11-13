"use client"

import { useRouter } from "next/navigation"
import AccountPicker from "@/components/layout/account-picker"
import { accountSettingsHref } from "@/lib/groups/navigation"
import type { Group } from "@/lib/groups/types"

/**
 * "for", right after the Settings title: whose settings these are, you
 * ("Me") or one of your groups, and a way to switch (`AccountPicker`).
 * Picking opens that account's settings page, keeping the section when it
 * has one of the same name (#account, #social-graph). Independent of the
 * workspace and of "Seen as".
 */
export default function SettingsForSwitcher({ current }: { current: Group | null }) {
  const router = useRouter()
  return (
    <AccountPicker
      prefix="for"
      label="Settings for"
      current={current}
      onSelect={(next) => router.push(`${accountSettingsHref(next)}${window.location.hash}`)}
    />
  )
}
