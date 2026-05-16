"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { ChevronDown, LogIn } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useProfile } from "@/hooks/use-profile"
import { useSession } from "@/hooks/use-session"
import { useOrg } from "@/lib/groups/org-context"
import { useOrgProfile } from "@/hooks/use-org-profile"
import { resolvePostSwitchPath } from "@/lib/groups/navigation"
import { getInitials } from "@/lib/utils/initials"
import Avatar from "@/components/ui/avatar"
import AccountSwitcherList from "./account-switcher-list"

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 }

/**
 * Self-contained account-switcher: trigger row + portaled menu when
 * authenticated, sign-in card when not. Previously lived inline at
 * the bottom of the desktop left rail; lifted out so the right rail
 * (above the search) can host it on desktop.
 *
 * Menu drops BELOW the trigger and is portaled to <body> so the
 * containing rail's `overflow-y: auto` can't clip it.
 */
export default function AccountSwitcher() {
  const router = useRouter()
  const { isAuthenticated, did, openSignIn, signOut } = useAuth()
  const { profile, avatarUrl } = useProfile()
  const { handle } = useSession()
  const { activeOrg, groups, switchOrg } = useOrg()
  const { orgAvatarUrl } = useOrgProfile()

  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [anchor, setAnchor] = useState<{
    left: number
    top: number
    width: number
  } | null>(null)
  useEffect(() => {
    if (!open || !triggerRef.current) {
      setAnchor(null)
      return
    }
    const compute = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setAnchor({
        left: rect.left,
        top: rect.bottom + 8,
        width: Math.max(rect.width, 280),
      })
    }
    compute()
    globalThis.addEventListener("resize", compute)
    globalThis.addEventListener("scroll", compute, true)
    return () => {
      globalThis.removeEventListener("resize", compute)
      globalThis.removeEventListener("scroll", compute, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      const inTrigger = triggerRef.current?.contains(t) ?? false
      const inMenu = menuRef.current?.contains(t) ?? false
      if (!inTrigger && !inMenu) setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      setOpen(false)
      triggerRef.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  const sortedOrgs = useMemo(() => {
    return [...groups].sort((a, b) => {
      if (a.accepted !== b.accepted) return a.accepted ? -1 : 1
      const roleA = ROLE_ORDER[a.role] ?? 3
      const roleB = ROLE_ORDER[b.role] ?? 3
      if (roleA !== roleB) return roleA - roleB
      const nameA = (a.displayName || a.handle).toLowerCase()
      const nameB = (b.displayName || b.handle).toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [groups])

  const identity = activeOrg
    ? {
        name: activeOrg.displayName || activeOrg.handle,
        handle: activeOrg.handle,
        avatarUrl: orgAvatarUrl || activeOrg.avatarUrl || undefined,
        initials: getInitials(activeOrg.displayName || activeOrg.handle),
      }
    : {
        name: profile?.displayName,
        handle,
        avatarUrl: avatarUrl || undefined,
        initials: getInitials(profile?.displayName, did),
      }

  if (!isAuthenticated) {
    return (
      <div className="account-switcher account-switcher--rail-top">
        <button
          type="button"
          className="right-rail__signin-btn"
          onClick={() => openSignIn()}
          aria-label="Sign in"
        >
          <LogIn size={16} strokeWidth={1.75} aria-hidden />
          <span>Sign in</span>
        </button>
      </div>
    )
  }

  return (
    <>
      <div
        className="account-switcher account-switcher--rail-top"
        ref={triggerRef}
      >
        <button
          type="button"
          className="right-rail__switcher"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Switch account (currently ${identity.name || "anonymous"})`}
        >
          <Avatar
            size="sm"
            src={identity.avatarUrl}
            fallbackInitials={identity.initials}
          />
          <span className="right-rail__switcher-meta">
            <span className="right-rail__switcher-name">
              {identity.name || "Anonymous"}
            </span>
            {identity.handle ? (
              <span className="right-rail__switcher-handle">
                @{identity.handle}
              </span>
            ) : null}
          </span>
          <ChevronDown size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      {mounted && open && anchor
        ? createPortal(
            <div
              ref={menuRef}
              className="account-switcher__menu account-switcher__menu--rail"
              role="menu"
              style={{
                position: "fixed",
                top: anchor.top,
                left: anchor.left,
                right: "auto",
                bottom: "auto",
                width: anchor.width,
              }}
            >
              <AccountSwitcherList
                session={{ handle: handle ?? null }}
                profile={
                  profile
                    ? { displayName: profile.displayName ?? undefined }
                    : null
                }
                avatarUrl={avatarUrl ?? undefined}
                sortedOrgs={sortedOrgs}
                activeOrg={activeOrg}
                switchOrg={switchOrg}
                onAfterSwitch={(next) => {
                  setOpen(false)
                  router.push(resolvePostSwitchPath(next))
                }}
                onSignOut={() => {
                  setOpen(false)
                  signOut()
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
