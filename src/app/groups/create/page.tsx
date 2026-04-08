"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useOrgCreationLimit } from "@/lib/groups/use-org-limit"
import { MAX_SELF_CREATED_ORGS } from "@/lib/groups/constants"
import { registerGroup, putMembership, putOrgProfile, putOrgMetadata, createBskyProfile } from "@/lib/groups/api"
import Input from "@/components/ui/input"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"

export default function CreateGroupPage() {
  const router = useRouter()
  const { did } = useAuth()
  const { refetchOrgs } = useOrg()
  const { isChecking, limitReached } = useOrgCreationLimit()

  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [nameError, setNameError] = useState("")
  const [handleError, setHandleError] = useState("")

  const validateName = (value: string) => {
    if (!value.trim()) {
      setNameError("Name is required")
      return false
    }
    if (value.length > 64) {
      setNameError("Name must be 64 characters or fewer")
      return false
    }
    setNameError("")
    return true
  }

  const validateHandle = (value: string) => {
    if (!value.trim()) {
      setHandleError("Handle is required")
      return false
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value) && value.length > 1) {
      setHandleError("Handle must be lowercase alphanumeric with hyphens")
      return false
    }
    if (value.length < 2) {
      setHandleError("Handle must be at least 2 characters")
      return false
    }
    if (value.length > 32) {
      setHandleError("Handle must be 32 characters or fewer")
      return false
    }
    setHandleError("")
    return true
  }

  const handleCreate = async () => {
    if (!did) return

    const nameValid = validateName(name)
    const handleValid = validateHandle(handle)
    if (!nameValid || !handleValid) return

    setIsCreating(true)
    setError(null)

    try {
      // 1. Register the group with the group service
      const result = await registerGroup(handle, did)

      // 2. Create an empty app.bsky.actor.profile for discoverability
      try {
        await createBskyProfile(result.groupDid)
      } catch {
        console.error("Failed to create Bluesky profile, continuing...")
      }

      // 3. Create the org profile with the display name
      try {
        await putOrgProfile(result.groupDid, {
          displayName: name.trim(),
          createdAt: new Date().toISOString(),
        })
      } catch {
        console.error("Failed to set org profile, continuing...")
      }

      // 4. Create empty group marker record
      try {
        await putOrgMetadata(result.groupDid, {
          createdAt: new Date().toISOString(),
        })
      } catch {
        console.error("Failed to set org metadata, continuing...")
      }

      // 5. Save membership record in user's own PDS
      await putMembership(did, result.groupDid, "owner")

      // 6. Refresh the groups list and navigate
      await refetchOrgs()
      router.push("/groups")
    } catch (err) {
      console.error("Failed to create group:", err)
      setError(
        err instanceof Error ? err.message : "Failed to create group"
      )
    } finally {
      setIsCreating(false)
    }
  }

  if (isChecking) {
    return (
      <div className="dashboard">
        <div className="dashboard__topbar">
          <h1 className="dashboard__page-title">Create Group</h1>
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
      </div>
    )
  }

  if (limitReached) {
    return (
      <div className="dashboard">
        <div className="dashboard__topbar">
          <h1 className="dashboard__page-title">Create Group</h1>
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
            <div className="dash-card">
              <h2 className="dash-card__title">Group limit reached</h2>
              <p className="dash-card__desc">
                You have created {MAX_SELF_CREATED_ORGS} groups that you
                are currently part of, which is the maximum allowed per account.
                If you need additional groups, please contact{" "}
                <a href="mailto:team@hypercerts.org">team@hypercerts.org</a>.
              </p>
              <div className="org-create__actions">
                <Button variant="ghost" onClick={() => router.push("/groups")}>
                  Back to Groups
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Create Group</h1>
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
          <div className="dash-card">
            <h2 className="dash-card__title">Group details</h2>
            <p className="dash-card__desc">
              Choose a name and handle for your group. The handle will be
              used as the group&apos;s identifier on the network.
            </p>

            <div className="org-create__fields">
              <Input
                label="Group name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  validateName(e.target.value)
                }}
                maxLength={64}
                placeholder="My Group"
                error={nameError}
              />

              <Input
                label="Handle"
                value={handle}
                onChange={(e) => {
                  const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                  setHandle(v)
                  validateHandle(v)
                }}
                maxLength={32}
                placeholder="my-group"
                error={handleError}
              />
              <p className="org-create__handle-hint">
                Lowercase letters, numbers, and hyphens only. Will be suffixed with the PDS hostname.
              </p>
            </div>

            {error && <ErrorMessage message={error} />}

            <div className="org-create__actions">
              <Button
                variant="ghost"
                onClick={() => router.push("/groups")}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                loading={isCreating}
                disabled={!name.trim() || !handle.trim() || isCreating}
              >
                Create Group
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
