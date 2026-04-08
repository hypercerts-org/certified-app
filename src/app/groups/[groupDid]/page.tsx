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

export default function OrgProfilePage() {
  const router = useRouter()
  const params = useParams()
  const groupDid = decodeURIComponent(params.groupDid as string)
  const { did } = useAuth()
  const { groups } = useOrg()

  const [profile, setProfile] = useState<OrgProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const org = groups.find((o) => o.groupDid === groupDid)

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
                    {profile?.website && (
                      <p className="profile-card__bio">
                        <a
                          href={profile.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="personal-info__field--link"
                        >
                          {profile.website}
                        </a>
                      </p>
                    )}
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
                      router.push(`/groups/${encodeURIComponent(groupDid)}/apps`)
                    }
                  >
                    Apps
                  </Button>
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
