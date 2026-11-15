"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Copy,
  ExternalLink,
  ListPlus,
  MoreHorizontal,
  Settings as SettingsIcon,
} from "lucide-react"
import Button from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
} from "@/components/ui/popover"
import { AddToListModal } from "@/components/lists/add-to-list-menu"
import { LIST_ACCOUNTS_TYPE } from "@/lib/atproto/typed-lists"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

interface ProfileMoreMenuProps {
  did: string
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
 * and (for the group's admins) its settings.
 */
export default function ProfileMoreMenu({
  did,
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

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button size="icon" variant="secondary" aria-label="More">
            <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end">
          {canList ? (
            <PopoverItem
              onClick={() => {
                setOpen(false)
                if (viewerDid) setListOpen(true)
                else openSignIn()
              }}
            >
              <ListPlus size={14} strokeWidth={1.75} aria-hidden />
              Add to list
            </PopoverItem>
          ) : null}
          <PopoverItem onClick={() => void copy(did)}>
            <Copy size={14} strokeWidth={1.75} aria-hidden />
            {copied ? "Permanent ID copied" : "Copy Permanent ID"}
          </PopoverItem>
          {blueskyUrl ? (
            <PopoverItem
              onClick={() => {
                setOpen(false)
                window.open(blueskyUrl, "_blank", "noopener,noreferrer")
              }}
            >
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
              Open on Bluesky
            </PopoverItem>
          ) : null}
          {settingsHref ? (
            <PopoverItem
              onClick={() => {
                setOpen(false)
                router.push(settingsHref)
              }}
            >
              <SettingsIcon size={14} strokeWidth={1.75} aria-hidden />
              Group settings
            </PopoverItem>
          ) : null}
        </PopoverContent>
      </Popover>
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
