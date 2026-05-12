"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Edit3 } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { getOrgProfile } from "@/lib/groups/api"
import type { OrgProfile } from "@/lib/groups/types"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Button from "@/components/ui/button"
import Avatar from "@/components/ui/avatar"
import { safeHttpUrl } from "@/lib/utils/safe-url"

export default function OrgProfilePage() {
  const router = useRouter()
  const params = useParams()
  const groupDid = decodeURIComponent(params.groupDid as string)
  const { did } = useAuth()
  const { groups, activeOrg } = useOrg()

  const [profile, setProfile] = useState<OrgProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const org = groups.find((o) => o.groupDid === groupDid)
  // True when the page reflects the org the user is currently *acting
  // as* (i.e. the result of an account-switcher choice), not a random
  // group profile they're just viewing. Used to surface an unambiguous
  // "Acting as" cue so the switcher's effect is visible immediately.
  const isActingAsThisOrg = activeOrg?.groupDid === groupDid

  const fetchProfile = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true)
      const p = await getOrgProfile(groupDid, signal)
      if (!signal?.aborted) setProfile(p)
    } catch {
      // ignore
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [groupDid])

  useEffect(() => {
    const controller = new AbortController()
    fetchProfile(controller.signal)
    return () => controller.abort()
  }, [fetchProfile])

  const canEdit = org && (org.role === "owner" || org.role === "admin")

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">
          {profile?.displayName || org?.displayName || "Group"}
        </h1>
        <div className="dashboard__topbar-right">
          <button
            className="dashboard__back-btn"
            onClick={() => router.push("/groups")}
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
      </div>

      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {isActingAsThisOrg ? (
            // Static eyebrow that mounts with the page — no aria-live
            // needed because screen readers announce the title change
            // on navigation. role="status" would falsely suggest this
            // text changes dynamically.
            <p className="profile-hero__eyebrow">Acting as this group</p>
          ) : null}
          {isLoading ? (
            <div className="org-profile__loading">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <>
              {/* Profile card */}
              <div className="dash-card">
                <div className="profile-card">
                  <Avatar
                    size="lg"
                    fallbackInitials={
                      (profile?.displayName || org?.displayName || "O").slice(0, 2)
                    }
                  />
                  <div className="profile-card__info">
                    <h2 className="profile-card__name">
                      {profile?.displayName || org?.displayName || "Unnamed"}
                    </h2>
                    {org?.handle && (
                      <p className="profile-card__handle">@{org.handle}</p>
                    )}
                    {profile?.description && (
                      <p className="profile-card__bio">{profile.description}</p>
                    )}
                    {(() => {
                      // Defense in depth: even though validateWebsite blocks
                      // non-http(s) URLs at edit time, foreign PDS records
                      // could carry anything. Re-check at render.
                      const safe = safeHttpUrl(profile?.website);
                      return safe ? (
                        <p className="profile-card__bio">
                          <a
                            href={safe}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="personal-info__field--link"
                          >
                            {safe}
                          </a>
                        </p>
                      ) : null;
                    })()}
                  </div>
                </div>
                {canEdit && (
                  <div className="mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        router.push(`/groups/${encodeURIComponent(groupDid)}/edit-profile`)
                      }
                    >
                      <Edit3 size={14} />
                      Edit Profile
                    </Button>
                  </div>
                )}
              </div>

              {/* DID info */}
              <div className="dash-card">
                <h3 className="dash-card__title">Identity</h3>
                <div className="personal-info__grid">
                  <div>
                    <span className="personal-info__label">DID</span>
                    <p className="personal-info__field--mono">{groupDid}</p>
                  </div>
                  {org?.role && (
                    <div>
                      <span className="personal-info__label">Your Role</span>
                      <p className="personal-info__field">{org.role}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick actions */}
              <div className="dash-card">
                <h3 className="dash-card__title">Manage</h3>
                <div className="org-manage__actions">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      router.push(`/groups/${encodeURIComponent(groupDid)}/settings`)
                    }
                  >
                    Settings
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
