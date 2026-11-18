"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, ExternalLink, ListPlus, Settings as SettingsIcon } from "lucide-react"
import { AddToListModal } from "@/components/lists/add-to-list-menu"
import MoreActionsMenu, { type MoreActionsEntry } from "@/components/lists/more-actions-menu"
import { LIST_ACCOUNTS_TYPE } from "@/lib/atproto/typed-lists"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

interface ProfileMoreMenuProps {
  did: string
  /** The account's name: the menu's sheet title on phones. */
  name: string
  /** The account's handle, for "Open on Bluesky". */
  handle: string | null
  /** The account has a Bluesky profile: adds "Open on Bluesky". */
  onBluesky: boolean
  /** The group's settings, for an admin of this group. */
  settingsHref?: string
}

/**
 * The visitor's "More" menu on a profile, after Follow and Share: add the
 * account to one of your lists, copy its Permanent ID, open it on Bluesky,
 * and (for the group's admins) its settings. A popover menu from 800px, a
 * sheet titled with the account's name below (`<MoreActionsMenu>`).
 */
export default function ProfileMoreMenu({
  did,
  name,
  handle,
  onBluesky,
  settingsHref,
}: ProfileMoreMenuProps) {
  const router = useRouter()
  const { did: viewerDid, openSignIn } = useAuth()
  const { activeOrg } = useOrg()
  const [open, setOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const { copied, copy } = useCopyToClipboard()

  // Lists are personal: none while acting as a group, and none for your
  // own account (seen while acting as a group).
  const canList = !activeOrg && viewerDid !== did

  // Keep the menu open a moment after a copy so "Copied" is seen.
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setOpen(false), 900)
    return () => window.clearTimeout(t)
  }, [copied])

  const blueskyUrl =
    onBluesky && handle && !handle.startsWith("did:")
      ? `https://bsky.app/profile/${encodeURIComponent(handle)}`
      : null

  const entries: MoreActionsEntry[] = []
  if (canList) {
    entries.push({
      key: "add-to-list",
      label: "Add to list",
      icon: ListPlus,
      onSelect: () => (viewerDid ? setListOpen(true) : openSignIn()),
    })
  }
  entries.push({
    key: "copy-id",
    label: copied ? "Permanent ID copied" : "Copy Permanent ID",
    icon: Copy,
    keepOpen: true,
    onSelect: () => void copy(did),
  })
  if (blueskyUrl) {
    entries.push({
      key: "bluesky",
      label: "Open on Bluesky",
      icon: ExternalLink,
      onSelect: () => window.open(blueskyUrl, "_blank", "noopener,noreferrer"),
    })
  }
  if (settingsHref) {
    entries.push({
      key: "settings",
      label: "Group settings",
      icon: SettingsIcon,
      onSelect: () => router.push(settingsHref),
    })
  }

  return (
    <>
      <MoreActionsMenu open={open} onOpenChange={setOpen} title={name} entries={entries} />
      <span className="sr-only" aria-live="polite">
        {copied ? "Permanent ID copied" : ""}
      </span>
      {listOpen && viewerDid ? (
        <AddToListModal
          viewerDid={viewerDid}
          targetUri={`at://${did}/app.certified.actor.profile/self`}
          targetCid=""
          targetType={LIST_ACCOUNTS_TYPE}
          onClose={() => setListOpen(false)}
        />
      ) : null}
    </>
  )
}
