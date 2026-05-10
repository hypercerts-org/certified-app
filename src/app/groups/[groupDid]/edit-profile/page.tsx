"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { getOrgProfile, putOrgProfile, getOrgMetadata, putOrgMetadata, uploadOrgBlob } from "@/lib/groups/api"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { getAvatarUrl, getBannerUrl } from "@/lib/atproto/profile"
import type { OrgProfile, GroupMetadata, OrgUrlItem } from "@/lib/groups/types"
import type { CertifiedProfile, HypercertsSmallImage, HypercertsLargeImage } from "@/lib/atproto/types"
import { normalizeWebsiteUrl } from "@/lib/utils/url"
import Input from "@/components/ui/input"
import Textarea from "@/components/ui/textarea"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
import AvatarUpload from "@/components/profile/avatar-upload"
import BannerUpload from "@/components/profile/banner-upload"

const ORG_TYPE_OPTIONS = [
  { value: "Nonprofit", description: "Registered 501(c)(3), charity, NGO, or equivalent." },
  { value: "Business", description: "For-profit entity with standard commercial operations." },
  { value: "Community Group", description: "Collective, cooperative, or other informal group." },
  { value: "Government", description: "Public agency with regulatory compliance requirements." },
  { value: "Indigenous Group", description: "Indigenous land council, territory, or community." },
  { value: "Other", description: "Select only if no other organization type applies." },
] as const

const PRESET_ORG_TYPES = ORG_TYPE_OPTIONS
  .map((o) => o.value)
  .filter((v) => v !== "Other")

export default function EditOrgProfilePage() {
  const router = useRouter()
  const params = useParams()
  const groupDid = decodeURIComponent(params.groupDid as string)

  const [profile, setProfile] = useState<OrgProfile | null>(null)
  const [metadata, setMetadata] = useState<GroupMetadata | null>(null)
  const [pdsUrl, setPdsUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Profile fields
  const [displayName, setDisplayName] = useState("")
  const [description, setDescription] = useState("")
  const [website, setWebsite] = useState("")
  const [websiteError, setWebsiteError] = useState("")

  // Group metadata fields
  const [foundedDate, setFoundedDate] = useState("")
  // Organization type — fixed presets + "Other" with free-text. The underlying
  // record is `string[]`; we drive UX as single-select. To avoid silently
  // collapsing legacy multi-value records, save preserves the loaded array
  // verbatim until the user actively changes the selection (`typeDirty`).
  const [typeSelection, setTypeSelection] = useState("")
  const [typeOtherText, setTypeOtherText] = useState("")
  const [typeOtherError, setTypeOtherError] = useState("")
  const [typeDirty, setTypeDirty] = useState(false)
  // Each row carries:
  //   - id: stable across re-renders so React keys don't reuse the same DOM
  //     node (and selection/focus) when a middle row is removed.
  //   - loadedRef: the original record item this row was hydrated from, or
  //     undefined for rows the user just added. On save, we spread loadedRef
  //     under the new url/label so any unknown per-item fields a future writer
  //     adds (e.g. verified, addedAt) survive a load-edit-save round-trip —
  //     same forward-compat pattern the metadata-build uses at the top level.
  type LinkRow = { id: string; url: string; label: string; loadedRef?: OrgUrlItem }
  const [urls, setUrls] = useState<LinkRow[]>([])
  // Parallel array of per-row error messages ("" = no error). Length stays
  // in sync with `urls` via the helpers below; cleared per-save attempt.
  const [urlErrors, setUrlErrors] = useState<string[]>([])
  const nextRowIdRef = React.useRef(0)
  const newRowId = () => {
    nextRowIdRef.current += 1
    return `row-${nextRowIdRef.current}`
  }

  // Image upload state
  const [avatarBlob, setAvatarBlob] = useState<Record<string, unknown> | null>(null)
  const [bannerBlob, setBannerBlob] = useState<Record<string, unknown> | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true)
      const [p, m, resolvedPds] = await Promise.all([
        getOrgProfile(groupDid, signal).catch(() => null),
        getOrgMetadata(groupDid, signal).catch(() => null),
        resolvePdsUrl(groupDid).catch(() => null),
      ])
      if (!signal?.aborted) {
        setProfile(p)
        setMetadata(m)
        setPdsUrl(resolvedPds)
        setDisplayName(p?.displayName || "")
        setDescription(p?.description || "")
        setWebsite(p?.website || "")
        if (m?.foundedDate) {
          setFoundedDate(m.foundedDate.split("T")[0])
        }
        const first = m?.organizationType?.[0]
        if (first) {
          if ((PRESET_ORG_TYPES as readonly string[]).includes(first)) {
            setTypeSelection(first)
          } else {
            setTypeSelection("Other")
            setTypeOtherText(first)
          }
        }
        if (m?.urls?.length) {
          setUrls(
            m.urls.map((u) => ({
              id: newRowId(),
              url: u.url,
              label: u.label ?? "",
              loadedRef: u,
            }))
          )
        }
      }
    } catch {
      // ignore
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [groupDid])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  // Compute current avatar/banner URLs from the profile
  const effectivePdsUrl = pdsUrl || process.env.NEXT_PUBLIC_PDS_URL || "https://certified.one"
  const currentAvatarUrl = profile
    ? getAvatarUrl(profile as CertifiedProfile, groupDid, effectivePdsUrl)
    : null
  const currentBannerUrl = profile
    ? getBannerUrl(profile as CertifiedProfile, groupDid, effectivePdsUrl)
    : null

  const handleAvatarUpload = async (file: File) => {
    setIsUploadingAvatar(true)
    try {
      const blobRef = await uploadOrgBlob(groupDid, file)
      setAvatarBlob(blobRef)
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleBannerUpload = async (file: File) => {
    setIsUploadingBanner(true)
    try {
      const blobRef = await uploadOrgBlob(groupDid, file)
      setBannerBlob(blobRef)
    } finally {
      setIsUploadingBanner(false)
    }
  }

  const fallbackInitials = displayName
    ? displayName.slice(0, 2).toUpperCase()
    : "O"

  const handleWebsiteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setWebsite(value)
    const result = normalizeWebsiteUrl(value)
    setWebsiteError(result.ok ? "" : "Please enter a valid URL")
  }

  // Additional links (urls) row helpers.
  const updateUrlField = (i: number, field: "url" | "label", value: string) => {
    setUrls((prev) => prev.map((u, idx) => (idx === i ? { ...u, [field]: value } : u)))
  }
  const removeUrl = (i: number) => {
    setUrls((prev) => prev.filter((_, idx) => idx !== i))
    setUrlErrors((prev) => prev.filter((_, idx) => idx !== i))
  }
  const addUrl = () => {
    setUrls((prev) => [...prev, { id: newRowId(), url: "", label: "" }])
    setUrlErrors((prev) => [...prev, ""])
  }

  const handleSave = async () => {
    // Re-validate website (accepts bare hostnames; prepends https:// on save).
    const websiteResult = normalizeWebsiteUrl(website)
    if (!websiteResult.ok) {
      setWebsiteError("Please enter a valid URL")
      return
    }
    setWebsiteError("")

    // If the user selected "Other" they must provide a value — only the value
    // they typed is saved, not the literal "Other".
    if (typeSelection === "Other" && !typeOtherText.trim()) {
      setTypeOtherError("Please describe the type, or pick another option.")
      return
    }
    setTypeOtherError("")

    // Validate + clean the additional links: drop fully-empty rows silently;
    // surface per-row errors for label-only or invalid-URL rows; abort save on
    // any error so the user sees what to fix. Each saved item spreads its
    // loadedRef first (when present) so unknown per-item fields survive the
    // round-trip; setting `label: undefined` when cleared lets JSON.stringify
    // drop it on the wire, matching the metadata-build forward-compat pattern.
    const cleanedUrls: OrgUrlItem[] = []
    const nextUrlErrors: string[] = urls.map(() => "")
    let hasUrlError = false
    for (let i = 0; i < urls.length; i++) {
      const row = urls[i]
      const trimmedUrl = row.url.trim()
      const trimmedLabel = (row.label ?? "").trim()
      if (!trimmedUrl && !trimmedLabel) continue
      if (!trimmedUrl) {
        nextUrlErrors[i] = "URL is required"
        hasUrlError = true
        continue
      }
      const r = normalizeWebsiteUrl(trimmedUrl)
      if (!r.ok || !r.url) {
        nextUrlErrors[i] = "Please enter a valid URL"
        hasUrlError = true
        continue
      }
      cleanedUrls.push({
        ...(row.loadedRef ?? {}),
        url: r.url,
        label: trimmedLabel || undefined,
      })
    }
    setUrlErrors(nextUrlErrors)
    if (hasUrlError) return

    setIsSaving(true)
    setSaveError(null)
    try {
      // Build profile update
      const updatedProfile: OrgProfile = {
        createdAt: profile?.createdAt || new Date().toISOString(),
        ...(displayName.trim() && { displayName: displayName.trim() }),
        ...(description.trim() && { description: description.trim() }),
        ...(websiteResult.url && { website: websiteResult.url }),
      }

      // Handle avatar
      if (avatarBlob) {
        updatedProfile.avatar = {
          $type: "org.hypercerts.defs#smallImage",
          image: avatarBlob,
        } as unknown
      } else if (profile?.avatar) {
        updatedProfile.avatar = profile.avatar
      }

      // Handle banner
      if (bannerBlob) {
        updatedProfile.banner = {
          $type: "org.hypercerts.defs#largeImage",
          image: bannerBlob,
        } as unknown
      } else if (profile?.banner) {
        updatedProfile.banner = profile.banner
      }

      // Build organizationType array. Preserve the loaded array verbatim until
      // the user actively changes the selection — protects multi-value legacy
      // records from being silently collapsed to one value on save.
      let nextOrgTypes: string[] | undefined
      if (!typeDirty && metadata?.organizationType?.length) {
        nextOrgTypes = metadata.organizationType
      } else if (typeSelection === "Other") {
        const t = typeOtherText.trim()
        nextOrgTypes = t ? [t] : undefined
      } else if (typeSelection) {
        nextOrgTypes = [typeSelection]
      } else {
        nextOrgTypes = undefined
      }

      // Build metadata update. Spread the loaded record first so any unknown
      // forward-compat fields (added by another writer or a future feature)
      // survive a load-edit-save round-trip; then overwrite the fields this
      // form actually owns. Setting a field to `undefined` lets JSON.stringify
      // drop it, so atproto putRecord replaces the record without the field.
      const updatedMetadata: GroupMetadata = {
        ...(metadata ?? {}),
        createdAt: metadata?.createdAt || new Date().toISOString(),
        organizationType: nextOrgTypes,
        foundedDate: foundedDate ? new Date(foundedDate).toISOString() : undefined,
        urls: cleanedUrls.length > 0 ? cleanedUrls : undefined,
      }

      await Promise.all([
        putOrgProfile(groupDid, updatedProfile),
        putOrgMetadata(groupDid, updatedMetadata),
      ])

      router.push("/")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Edit</h1>
      </div>

      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {isLoading ? (
            <div className="edit-profile__loading">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <div className="edit-profile">
              {/* Banner + avatar — mirrors profile page layout */}
              <div className="dash-card">
                <BannerUpload
                  currentBannerUrl={currentBannerUrl}
                  onUpload={handleBannerUpload}
                  isUploading={isUploadingBanner}
                />
                <div className="edit-profile__avatar-row">
                  <AvatarUpload
                    currentAvatarUrl={currentAvatarUrl}
                    fallbackInitials={fallbackInitials}
                    onUpload={handleAvatarUpload}
                    isUploading={isUploadingAvatar}
                  />
                  <div className="edit-profile__name-field">
                    <Input
                      label="Display name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={64}
                      placeholder="Group name"
                    />
                  </div>
                </div>
              </div>

              {/* Fields */}
              <div className="dash-card">
                <div className="edit-profile__fields">
                  <div>
                    <Textarea
                      label="About"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      maxLength={256}
                      placeholder="Describe your group"
                    />
                    <div className="edit-profile__char-count">
                      {description.length}/256 characters
                    </div>
                  </div>
                  <Input
                    label="Website"
                    type="url"
                    value={website}
                    onChange={handleWebsiteChange}
                    maxLength={256}
                    placeholder="https://example.org"
                    error={websiteError}
                  />
                  <Input
                    label="Founded date"
                    type="date"
                    value={foundedDate}
                    onChange={(e) => setFoundedDate(e.target.value)}
                  />
                  <fieldset>
                    <legend className="app-card__label block mb-1.5">Type</legend>
                    <div className="flex flex-col gap-1">
                      {ORG_TYPE_OPTIONS.map((opt) => {
                        const checked = typeSelection === opt.value
                        return (
                          <label
                            key={opt.value}
                            className={`flex items-start gap-3 rounded border px-3 py-2.5 cursor-pointer transition-colors ${
                              checked
                                ? "border-accent bg-accent/5"
                                : "border-[rgba(15,37,68,0.15)] hover:border-[rgba(15,37,68,0.3)]"
                            }`}
                          >
                            <input
                              type="radio"
                              name="org-type"
                              value={opt.value}
                              checked={checked}
                              onChange={() => {
                                setTypeSelection(opt.value)
                                setTypeDirty(true)
                                // Intentionally don't clear `typeOtherText` when switching off
                                // Other — preserves the user's typed value so toggling back
                                // restores it. Save logic ignores typeOtherText unless the
                                // selected radio is Other, so no risk of leaking the stale
                                // value into the saved record.
                                if (opt.value !== "Other") setTypeOtherError("")
                              }}
                              className="mt-0.5 accent-accent"
                            />
                            <span className="flex-1">
                              <span className="block text-sm text-gray-700">{opt.value}</span>
                              <span className="block text-xs text-gray-400 mt-0.5">
                                {opt.description}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {typeSelection === "Other" && (
                      <div className="mt-2">
                        <Input
                          value={typeOtherText}
                          onChange={(e) => {
                            setTypeOtherText(e.target.value)
                            setTypeDirty(true)
                            if (e.target.value.trim()) setTypeOtherError("")
                          }}
                          placeholder="Describe the type"
                          maxLength={64}
                          error={typeOtherError}
                          aria-label="Custom organization type"
                        />
                      </div>
                    )}
                  </fieldset>
                  <div>
                    <label className="app-card__label block mb-1.5">
                      Additional links
                    </label>
                    {urls.length > 0 && (
                      <div className="flex flex-col gap-3 mb-2">
                        {urls.map((u, i) => (
                          <div key={u.id} className="flex items-start gap-2">
                            <div className="flex-1">
                              <Input
                                value={u.url}
                                onChange={(e) => updateUrlField(i, "url", e.target.value)}
                                placeholder="https://example.org"
                                maxLength={512}
                                error={urlErrors[i]}
                              />
                            </div>
                            <div className="flex-1">
                              <Input
                                value={u.label ?? ""}
                                onChange={(e) => updateUrlField(i, "label", e.target.value)}
                                placeholder="Label (optional)"
                                maxLength={64}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeUrl(i)}
                              disabled={isSaving}
                              aria-label="Remove link"
                              className="h-11 w-11 flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-error border border-transparent hover:border-error/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button variant="ghost" size="sm" onClick={addUrl} disabled={isSaving}>
                      <Plus size={14} />
                      Add link
                    </Button>
                  </div>
                </div>

                {saveError && <ErrorMessage message={saveError} />}

                <div className="edit-profile__actions">
                  <Button variant="ghost" onClick={() => router.push("/")} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={isSaving || !!websiteError}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
