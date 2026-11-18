"use client"

import { useAuthorInfo } from "@/hooks/use-author-info"
import { accountName } from "@/lib/utils/identity"

/**
 * What `useOwnerByline` returns while the owner is still being looked up:
 * an empty line. A row renders it as a blank line of the same height, so
 * the row doesn't grow when "by <owner>" arrives.
 */
export const OWNER_BYLINE_PENDING = ""

/**
 * "by <owner>" for an Explore row or card: the account's name, or a handle
 * a person chose. `OWNER_BYLINE_PENDING` (an empty string, falsy) while the
 * lookup runs, so a row can hold the line's place. Null without a DID, or
 * when the account has neither (a "by Unnamed account" line says nothing;
 * the row's other lines carry it). A machine handle or a DID is never the
 * name.
 */
export function useOwnerByline(did: string | null): string | null {
  const { info } = useAuthorInfo(did || null)
  if (!did) return null
  if (!info) return OWNER_BYLINE_PENDING
  const { name, fallback } = accountName(info.displayName, info.handle, did)
  return fallback ? null : `by ${name}`
}
