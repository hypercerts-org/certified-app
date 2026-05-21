"use client"

import { useCallback, useState } from "react"
import type { BlobRef } from "@atproto/api"
import { authFetch } from "@/lib/auth/fetch"
import { extractError } from "@/lib/utils/api"
import {
  putProfile,
  uploadAvatar,
  uploadBanner,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import type {
  CertifiedProfile,
  HypercertsSmallImage,
  HypercertsLargeImage,
} from "@/lib/atproto/types"
import type { SocialGraphSyncResult } from "@/hooks/use-social-graph-sync"
import type { ProfileDraft } from "./steps/step-profile"
import type { GraphIntent } from "./steps/step-graph"

/**
 * Substep of the batched onboarding commit. Threaded into the CommitState
 * so Step 3's checklist can highlight which line is "running" right now.
 */
export type CommitStage =
  | "profile-clone"
  | "profile-write"
  | "sync"

export type CommitState =
  | { status: "idle" }
  | { status: "running"; stage: CommitStage }
  | {
      status: "success"
      syncResult: SocialGraphSyncResult | null
    }
  | {
      status: "error"
      stage: CommitStage
      error: string
    }

interface UseOnboardingCommitArgs {
  readonly did: string | null
  readonly candidateDids: string[]
  importDids: (
    dids: string[],
    opts?: { signal?: AbortSignal },
  ) => Promise<SocialGraphSyncResult>
  onSuccess: () => void
}

export function useOnboardingCommit({
  did,
  candidateDids,
  importDids,
  onSuccess,
}: UseOnboardingCommitArgs): {
  state: CommitState
  run: (draft: ProfileDraft, intent: GraphIntent) => Promise<void>
} {
  const [state, setState] = useState<CommitState>({ status: "idle" })

  const run = useCallback(
    async (draft: ProfileDraft, intent: GraphIntent) => {
      if (!did) return
      // Profile-clone stage: upload any replacement files the user
      // picked, OR clone the bsky CDN URL into a fresh blob on the
      // user's certified PDS. Either way we end up with a blob ref
      // that lives inside the user's repo — durable, not tied to
      // bsky's CDN lifecycle.
      setState({ status: "running", stage: "profile-clone" })
      let avatarBlob: UploadedBlob | null = null
      let bannerBlob: UploadedBlob | null = null
      try {
        if (draft.replacementAvatarFile) {
          avatarBlob = await uploadAvatar(draft.replacementAvatarFile)
        } else if (draft.sourceAvatarUrl) {
          avatarBlob = await cloneSourceBlob(draft.sourceAvatarUrl)
        }
        if (draft.replacementBannerFile) {
          bannerBlob = await uploadBanner(draft.replacementBannerFile)
        } else if (draft.sourceBannerUrl) {
          bannerBlob = await cloneSourceBlob(draft.sourceBannerUrl)
        }
      } catch (err) {
        setState({
          status: "error",
          stage: "profile-clone",
          error: err instanceof Error ? err.message : "Failed to import image",
        })
        return
      }

      // Profile-write stage: assemble the CertifiedProfile and POST it
      // via putProfile (same path the regular edit form uses).
      setState({ status: "running", stage: "profile-write" })
      const trimmed = {
        displayName: draft.displayName.trim(),
        description: draft.description.trim(),
        pronouns: draft.pronouns.trim(),
        website: draft.website.trim(),
      }
      const profile: CertifiedProfile = {
        createdAt: new Date().toISOString(),
        ...(trimmed.displayName && { displayName: trimmed.displayName }),
        ...(trimmed.description && { description: trimmed.description }),
        ...(trimmed.pronouns && { pronouns: trimmed.pronouns }),
        ...(trimmed.website && { website: trimmed.website }),
      }
      if (avatarBlob) {
        const small: HypercertsSmallImage = {
          $type: "org.hypercerts.defs#smallImage",
          image: avatarBlob as unknown as BlobRef,
        }
        profile.avatar = small
      }
      if (bannerBlob) {
        const large: HypercertsLargeImage = {
          $type: "org.hypercerts.defs#largeImage",
          image: bannerBlob as unknown as BlobRef,
        }
        profile.banner = large
      }
      try {
        await putProfile(did, profile)
      } catch (err) {
        setState({
          status: "error",
          stage: "profile-write",
          error: err instanceof Error ? err.message : "Failed to save profile",
        })
        return
      }

      // Sync stage: only when the user opted in. A failure here
      // leaves the profile in place (it's already saved) and the
      // re-entry banner stays visible until they finish manually
      // via Settings → Sync social graph.
      let syncResult: SocialGraphSyncResult | null = null
      if (intent.kind === "importAll" && candidateDids.length > 0) {
        setState({ status: "running", stage: "sync" })
        try {
          syncResult = await importDids(candidateDids)
        } catch (err) {
          setState({
            status: "error",
            stage: "sync",
            error: err instanceof Error ? err.message : "Failed to sync follows",
          })
          return
        }
      }

      setState({ status: "success", syncResult })
      onSuccess()
    },
    [did, candidateDids, importDids, onSuccess],
  )

  return { state, run }
}

/**
 * Server-side clone of an external image URL into the authenticated
 * user's PDS. Wraps the `/api/onboarding/clone-blob` route. The
 * server validates host + size + mime, fetches bytes, and uploads
 * via the user's OAuth session.
 */
async function cloneSourceBlob(sourceUrl: string): Promise<UploadedBlob> {
  const res = await authFetch("/api/onboarding/clone-blob", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceUrl }),
  })
  if (!res.ok) {
    throw new Error(await extractError(res, "Failed to import image"))
  }
  const data = (await res.json()) as { blob?: UploadedBlob }
  if (!data.blob || typeof data.blob.ref?.$link !== "string") {
    throw new Error("clone-blob response missing blob.ref.$link")
  }
  return data.blob
}
