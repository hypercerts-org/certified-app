"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useToast } from "@/components/ui/toast"
import { useOrg } from "./org-context"

export interface NewGroup {
  groupDid: string
  /** The name the toast uses: the group's display name, or its @handle. */
  name: string
}

/**
 * After a group is created (`/groups/create`) or an account is turned into
 * one (`/groups/import`): act as it, open its Overview and say so in a
 * toast. Call the returned function once the groups list has been
 * refetched (`refetchOrgs`); the switch takes the group from that list,
 * on the next render.
 *
 * - A new group in the list: switch to it, "Created <name>. You're acting
 *   as it now."
 * - Not in the list yet (its membership hasn't been read back): stay on
 *   the personal account, "Created <name>." The Overview opens either way.
 * - An imported account is the signed-in account itself (a self-owned
 *   group, never in the list), so there is nothing to switch to.
 */
export function useActAsNewGroup(): (created: NewGroup) => void {
  const { groups, switchOrg } = useOrg()
  const { did } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = useState<NewGroup | null>(null)

  useEffect(() => {
    if (!pending) return
    setPending(null)
    if (pending.groupDid === did) {
      toast({ title: `Turned ${pending.name} into a group`, variant: "success" })
    } else {
      const group = groups.find((g) => g.groupDid === pending.groupDid)
      if (group) switchOrg(group)
      toast({
        title: `Created ${pending.name}`,
        description: group ? "You're acting as it now." : undefined,
        variant: "success",
      })
    }
    router.push("/home")
  }, [pending, groups, did, switchOrg, toast, router])

  return useCallback((created: NewGroup) => setPending(created), [])
}
