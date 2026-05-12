"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useOrgCreationLimit } from "@/lib/groups/use-org-limit"
import { usePageTitle } from "@/lib/navbar-context"
import { MAX_SELF_CREATED_ORGS } from "@/lib/groups/constants"
import { registerGroup, RegisterGroupError, putMembership, putOrgProfile, putOrgMetadata, createBskyProfile } from "@/lib/groups/api"
import Input from "@/components/ui/input"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"

export default function CreateGroupPage() {
  usePageTitle("New Group")
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
    if (value.length < 2) {
      setHandleError("Handle must be at least 2 characters")
      return false
    }
    if (value.length > 32) {
      setHandleError("Handle must be 32 characters or fewer")
      return false
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value)) {
      setHandleError("Handle must be lowercase alphanumeric with hyphens")
      return false
    }
    setHandleError("")
    return true
  }

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!did) return

    const nameValid = validateName(name)
    const handleValid = validateHandle(handle)
    if (!nameValid || !handleValid) return

    setIsCreating(true)
    setError(null)

    try {
      const result = await registerGroup(handle, did)

      try {
        await createBskyProfile(result.groupDid)
      } catch {
        console.error("Failed to create Bluesky profile, continuing...")
      }

      try {
        await putOrgProfile(result.groupDid, {
          displayName: name.trim(),
          createdAt: new Date().toISOString(),
        })
      } catch {
        console.error("Failed to set org profile, continuing...")
      }

      try {
        await putOrgMetadata(result.groupDid, {
          createdAt: new Date().toISOString(),
        })
      } catch {
        console.error("Failed to set org metadata, continuing...")
      }

      await putMembership(did, result.groupDid, "owner")
      await refetchOrgs()
      router.push("/groups")
    } catch (err) {
      console.error("Failed to create group:", err)
      if (err instanceof RegisterGroupError && err.code === "HandleNotAvailable") {
        setHandleError("This handle is already taken. Please choose another.")
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to create group"
        )
      }
    } finally {
      setIsCreating(false)
    }
  }

  if (isChecking) {
    return (
      <div className="dashboard">
        <div className="dashboard__body dashboard__body--single">
          <div className="dashboard__main">
            <div className="org-list__loading">
              <LoadingSpinner size="md" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (limitReached) {
    return (
      <div className="dashboard">
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
            </div>
          </div>
        </div>
      </div>
    )
  }

  const isValid = name.trim().length > 0 && handle.trim().length >= 2 && !nameError && !handleError

  return (
    <div className="dashboard">
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          <form className="dash-card" onSubmit={handleCreate}>
            <div className="org-create__fields">
              <Input
                label="Group name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) validateName(e.target.value)
                }}
                onBlur={() => validateName(name)}
                maxLength={64}
                placeholder="My Group"
                error={nameError}
                autoFocus
              />

              <div>
                <Input
                  label="Handle"
                  value={handle}
                  onChange={(e) => {
                    const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                    setHandle(v)
                    if (handleError) validateHandle(v)
                  }}
                  onBlur={() => validateHandle(handle)}
                  maxLength={32}
                  placeholder="my-group"
                  error={handleError}
                />
                <p className="org-create__handle-hint">
                  Lowercase letters, numbers, and hyphens only. Will be suffixed with the PDS hostname.
                </p>
              </div>
            </div>

            {error && <ErrorMessage message={error} />}

            <div className="org-create__actions">
              <Button
                type="submit"
                variant="primary"
                loading={isCreating}
                disabled={!isValid || isCreating}
              >
                Create
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
