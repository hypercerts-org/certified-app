"use client"

import {
  useEffect,
  useMemo,
  useState,
} from "react"
import { Search } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { RadioGroup, Radio } from "@/components/ui/radio"
import { useAuthorInfo } from "@/hooks/use-author-info"
import type {
  SocialGraphSyncStats,
} from "@/hooks/use-social-graph-sync"
import { getInitials } from "@/lib/utils/initials"
import type { CommitState } from "../use-onboarding-commit"

/**
 * Captures the user's intent for the social-graph step. The modal's
 * footer Finish button dispatches based on this — "Skip and finish"
 * runs the profile commit only, the other two prefix it with an
 * importDids call.
 */
export type GraphIntent =
  | { kind: "skip" }
  | { kind: "all" }
  | { kind: "select" }

interface StepGraphProps {
  readonly stats: SocialGraphSyncStats
  readonly isLoading: boolean
  readonly truncated: boolean
  readonly error: string | null
  readonly intent: GraphIntent
  onChange: (intent: GraphIntent) => void
  /** Pick-specific selection set, lifted to the modal so the footer
   *  Finish button can read the count for its label. */
  readonly selected: Set<string>
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  /** Modal-level commit pipeline state. Drives the live progress
   *  line during the sync stage. */
  readonly commit: CommitState
}

export default function StepGraph({
  stats,
  isLoading,
  truncated,
  error,
  intent,
  onChange,
  selected,
  setSelected,
  commit,
}: StepGraphProps) {
  const candidateDids = stats.onlyBluesky
  const candidateCount = candidateDids.length
  const overlapCount = stats.inBoth.length
  const canImport = !isLoading && !truncated && !error && candidateCount > 0

  const [query, setQuery] = useState("")

  const isSyncRunning =
    commit.status === "running" && commit.stage === "sync"
  const isCommitting = commit.status === "running"

  // -------------------- Loading / error gates -----------------------

  if (isLoading) {
    return (
      <div className="onboarding-step onboarding-step--graph">
        <div className="onboarding-step__loading">
          <LoadingSpinner size="md" />
          <span>Comparing your Bluesky and Certified graphs…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="onboarding-step onboarding-step--graph">
        <p className="onboarding-step__error" role="alert">
          {error}
        </p>
      </div>
    )
  }

  if (truncated) {
    return (
      <div className="onboarding-step onboarding-step--graph">
        <p className="onboarding-step__error" role="alert">
          Your follow list is too large to compare safely (more than
          10,000 follows). Sync is disabled — use Settings → Sync
          social graph after onboarding to import in smaller batches.
        </p>
      </div>
    )
  }

  // -------------------- Main render --------------------------------

  return (
    <div className="onboarding-step onboarding-step--graph">
      <div className="onboarding-step__graph-stats">
        <Tile
          label="Now on Certified"
          value={overlapCount}
          highlight={isSyncRunning}
        />
        <Tile label="Bluesky-only remaining" value={candidateCount} />
      </div>

      {isSyncRunning ? (
        <p className="onboarding-step__progress" role="status">
          Importing follows… <strong>{overlapCount}</strong>{" "}
          {overlapCount === 1 ? "added" : "added"} so far
        </p>
      ) : null}

      {/* Segments are hidden while the pipeline is mid-flight so the
          user can't toggle intent under the commit's feet. */}
      {!isCommitting && canImport ? (
        <RadioGroup
          className="onboarding-step__segments"
          aria-label="What to do with Bluesky-only follows"
          value={intent.kind}
          onValueChange={(kind) =>
            onChange({ kind } as GraphIntent)
          }
        >
          <Radio
            value="all"
            className={`onboarding-step__segment${
              intent.kind === "all" ? " onboarding-step__segment--active" : ""
            }`}
          >
            Import all
          </Radio>
          <Radio
            value="select"
            className={`onboarding-step__segment${
              intent.kind === "select" ? " onboarding-step__segment--active" : ""
            }`}
          >
            Pick specific
          </Radio>
          <Radio
            value="skip"
            className={`onboarding-step__segment${
              intent.kind === "skip" ? " onboarding-step__segment--active" : ""
            }`}
          >
            Skip
          </Radio>
        </RadioGroup>
      ) : null}

      {!isCommitting && intent.kind === "select" ? (
        <Picker
          candidateDids={candidateDids}
          selected={selected}
          setSelected={setSelected}
          query={query}
          setQuery={setQuery}
        />
      ) : null}
    </div>
  )
}

// ============================================================================
// Tile
// ============================================================================

function Tile({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div
      className={`onboarding-step__tile${
        highlight ? " onboarding-step__tile--highlight" : ""
      }`}
    >
      <span className="onboarding-step__tile-value">
        {new Intl.NumberFormat().format(value)}
      </span>
      <span className="onboarding-step__tile-label">{label}</span>
    </div>
  )
}

// ============================================================================
// Inline picker — checkbox list with search; no nested dialog.
// ============================================================================

interface PickerProps {
  candidateDids: string[]
  selected: Set<string>
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  query: string
  setQuery: React.Dispatch<React.SetStateAction<string>>
}

function Picker({
  candidateDids,
  selected,
  setSelected,
  query,
  setQuery,
}: PickerProps) {
  const names = useNamesMap(candidateDids)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidateDids
    return candidateDids.filter((d) =>
      (names.get(d) ?? d.toLowerCase()).includes(q),
    )
  }, [candidateDids, query, names])

  const toggle = (did: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(did)) next.delete(did)
      else next.add(did)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = filtered.every((d) => next.has(d))
      if (allSelected) filtered.forEach((d) => next.delete(d))
      else filtered.forEach((d) => next.add(d))
      return next
    })
  }

  const allSelected =
    filtered.length > 0 && filtered.every((d) => selected.has(d))

  return (
    <div className="onboarding-step__picker">
      <label className="onboarding-step__picker-search">
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          placeholder="Search Bluesky-only follows…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="onboarding-step__picker-meta">
        <button
          type="button"
          className="onboarding-step__picker-toggle"
          onClick={toggleAll}
          disabled={filtered.length === 0}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span className="onboarding-step__picker-counter">
          {selected.size} selected · {filtered.length}{" "}
          {filtered.length === 1 ? "match" : "matches"}
        </span>
      </div>

      <ul className="onboarding-step__picker-list" role="listbox">
        {filtered.length === 0 ? (
          <li className="onboarding-step__picker-empty">
            {query.trim() ? `No matches for "${query.trim()}".` : "Empty."}
          </li>
        ) : (
          filtered.map((d) => (
            <PickerRow
              key={d}
              did={d}
              checked={selected.has(d)}
              onToggle={() => toggle(d)}
            />
          ))
        )}
      </ul>
    </div>
  )
}

function PickerRow({
  did,
  checked,
  onToggle,
}: {
  did: string
  checked: boolean
  onToggle: () => void
}) {
  const { info, isLoading } = useAuthorInfo(did)
  const name = info?.displayName || info?.handle || did
  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  return (
    <li className="onboarding-step__picker-row">
      <label>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        {isLoading && !info ? (
          <div className="onboarding-step__picker-avatar-skel" aria-hidden />
        ) : (
          <Avatar
            size="sm"
            src={info?.avatarUrl || undefined}
            fallbackInitials={getInitials(info?.displayName, did)}
          />
        )}
        <div className="onboarding-step__picker-row-info">
          <span className="onboarding-step__picker-row-name">{name}</span>
          {handle ? (
            <span className="onboarding-step__picker-row-handle">@{handle}</span>
          ) : null}
        </div>
      </label>
    </li>
  )
}

// ============================================================================
// Name cache (mirrors the pattern in sync-social-graph-section.tsx).
// ============================================================================

const nameCache = new Map<string, string>()
const namePromises = new Map<string, Promise<string>>()

function fetchName(did: string): Promise<string> {
  const cached = namePromises.get(did)
  if (cached) return cached
  const p = fetch(`/api/resolve-did?did=${encodeURIComponent(did)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { handle?: string; displayName?: string } | null) => {
      const name = ((data?.displayName || data?.handle) ?? did).toLowerCase()
      nameCache.set(did, name)
      return name
    })
    .catch(() => {
      nameCache.set(did, did.toLowerCase())
      return did.toLowerCase()
    })
  namePromises.set(did, p)
  return p
}

function useNamesMap(dids: string[]): Map<string, string> {
  const [, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    const missing = dids.filter((d) => !nameCache.has(d))
    if (missing.length === 0) return
    Promise.all(missing.map((d) => fetchName(d))).then(() => {
      if (!cancelled) setTick((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [dids])
  return useMemo(() => {
    const out = new Map<string, string>()
    for (const d of dids) {
      out.set(d, nameCache.get(d) ?? d.toLowerCase())
    }
    return out
  }, [dids])
}
