"use client"

import AccountPicker from "@/components/layout/account-picker"
import { useSeenAs } from "@/lib/groups/seen-as"

/**
 * "Seen as", right after the Feed and Explore titles: which account the
 * network is shown for, you ("Me") or one of your groups, and a way to
 * switch (`AccountPicker`). Its own setting (`useSeenAs`), separate from
 * who you act as: picking here never changes the account control, and
 * switching there never changes this. It only decides what you read;
 * likes and comments go out as the account you act as.
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
