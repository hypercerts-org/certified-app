"use client"

import { useAuthorInfo } from "@/hooks/use-author-info"
import { accountName } from "@/lib/utils/identity"

/**
 * "by <owner>" for an Explore row or card: the account's name, or a handle
 * a person chose. Null while unknown, without a DID, or when the account
 * has neither (a "by Unnamed account" line says nothing; the row's other
 * lines carry it). A machine handle or a DID is never the name.
 */
export function useOwnerByline(did: string | null): string | null {
  const { info } = useAuthorInfo(did || null)
  if (!did || !info) return null
  const { name, fallback } = accountName(info.displayName, info.handle, did)
  return fallback ? null : `by ${name}`
}
