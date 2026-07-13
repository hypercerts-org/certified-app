"use client"

import { useEffect, useId, useMemo } from "react"
import Input from "@/components/ui/input"
import Textarea from "@/components/ui/textarea"

/**
 * Draft state for the onboarding profile step. Held entirely in the
 * modal — nothing is written to the PDS until the user clicks Finish
 * on Step 3. `sourceAvatarUrl` / `sourceBannerUrl` are the bsky CDN
 * URLs we seed from /api/resolve-did; the server-side clone-blob route
 * fetches and re-uploads those on commit. If the user picks new files
 * via Replace, those win over the source URLs.
 */
export interface ProfileDraft {
  displayName: string
  description: string
  website: string
  sourceAvatarUrl: string | null
  sourceBannerUrl: string | null
  replacementAvatarFile: File | null
  replacementBannerFile: File | null
}

interface StepProfileProps {
  readonly draft: ProfileDraft
  onChange: (draft: ProfileDraft) => void
  readonly handle?: string
}

export default function StepProfile({
  draft,
  onChange,
  handle,
}: StepProfileProps) {
  const displayNameId = useId()
  const descriptionId = useId()
  const websiteId = useId()

  // Object URLs for replacement files are memoized on the File and revoked
  // on change/unmount, so re-renders (e.g. on every keystroke) don't leak a
  // fresh blob URL each time.
  const avatarObjectUrl = useMemo(
    () =>
      draft.replacementAvatarFile
        ? URL.createObjectURL(draft.replacementAvatarFile)
        : null,
    [draft.replacementAvatarFile],
  )
  const bannerObjectUrl = useMemo(
    () =>
      draft.replacementBannerFile
        ? URL.createObjectURL(draft.replacementBannerFile)
        : null,
    [draft.replacementBannerFile],
  )

  useEffect(() => {
    if (!avatarObjectUrl) return
    return () => URL.revokeObjectURL(avatarObjectUrl)
  }, [avatarObjectUrl])
  useEffect(() => {
    if (!bannerObjectUrl) return
    return () => URL.revokeObjectURL(bannerObjectUrl)
  }, [bannerObjectUrl])

  const previewAvatarUrl = avatarObjectUrl ?? draft.sourceAvatarUrl
  const previewBannerUrl = bannerObjectUrl ?? draft.sourceBannerUrl

  const update = <K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K],
  ) => {
    onChange({ ...draft, [key]: value })
  }

  return (
    <div className="onboarding-step onboarding-step--profile">
      <div className="onboarding-step__hero">
        {previewBannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- previewBannerUrl is a blob: object URL or an arbitrary remote bsky banner; next/image supports neither (remotePatterns is limited to **.certified.app)
          <img
            src={previewBannerUrl}
            alt=""
            aria-hidden
            className="onboarding-step__banner"
          />
        ) : (
          <div className="onboarding-step__banner onboarding-step__banner--empty" />
        )}
        <div className="onboarding-step__avatar-slot">
          {previewAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- previewAvatarUrl is a blob: object URL or an arbitrary remote bsky avatar; same remotePatterns constraint as the banner above
            <img
              src={previewAvatarUrl}
              alt=""
              aria-hidden
              className="onboarding-step__avatar"
            />
          ) : (
            <div className="onboarding-step__avatar onboarding-step__avatar--empty">
              {(draft.displayName || handle || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      <div className="onboarding-step__media-actions">
        <label className="onboarding-step__file-btn">
          Replace avatar
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) =>
              update("replacementAvatarFile", e.target.files?.[0] ?? null)
            }
            hidden
          />
        </label>
        <label className="onboarding-step__file-btn">
          Replace banner
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) =>
              update("replacementBannerFile", e.target.files?.[0] ?? null)
            }
            hidden
          />
        </label>
      </div>

      <div className="onboarding-step__fields">
        <div className="onboarding-step__field">
          <label htmlFor={displayNameId} className="onboarding-step__label">
            <span>Display name</span>
            <span className="onboarding-step__label-count">
              {draft.displayName.length}/64
            </span>
          </label>
          <Input
            id={displayNameId}
            type="text"
            value={draft.displayName}
            maxLength={64}
            placeholder="Your name"
            onChange={(e) => update("displayName", e.target.value)}
            required
          />
        </div>

        <div className="onboarding-step__field">
          <label htmlFor={descriptionId} className="onboarding-step__label">
            <span>About</span>
            <span className="onboarding-step__label-count">
              {draft.description.length}/256
            </span>
          </label>
          <Textarea
            id={descriptionId}
            rows={3}
            maxLength={256}
            value={draft.description}
            placeholder="A short description of you and your work."
            onChange={(e) => update("description", e.target.value)}
          />
        </div>

        <div className="onboarding-step__field">
          <label htmlFor={websiteId} className="onboarding-step__label">
            <span>Website</span>
          </label>
          <Input
            id={websiteId}
            type="url"
            inputMode="url"
            value={draft.website}
            maxLength={256}
            placeholder="https://example.com"
            onChange={(e) => update("website", e.target.value)}
          />
        </div>
      </div>

      <p className="onboarding-step__footnote">
        Seeded from your Bluesky profile. Anything you change here only
        affects your Certified profile — your Bluesky account is unchanged.
      </p>
    </div>
  )
}
