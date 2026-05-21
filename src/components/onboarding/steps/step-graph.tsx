"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Search } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useAuthorInfo } from "@/hooks/use-author-info"
import type {
  SocialGraphSyncStats,
  SocialGraphSyncResult,
} from "@/hooks/use-social-graph-sync"
import { getInitials } from "@/lib/utils/initials"

/**
 * Captures the user's intent for the social-graph step so the modal
 * can decide what to do when they click Continue / Finish.
 *
 * - `skip`: user chose not to sync. Continue is enabled immediately.
 * - `all`: user opted to import every bluesky-only follow.
 * - `select`: user opted to pick a subset.
 *
 * The actual sync runs in-place on this step — see `useSyncRunner`.
 */
export type GraphIntent =
  | { kind: "skip" }
  | { kind: "all" }
  | { kind: "select" }

/** Sync lifecycle owned by this step. Mirrors what the modal needs to
 *  know about "is sync done so Continue can light up?" */
export type SyncRunnerState =
  | { status: "idle" }
  | { status: "running"; importedCount: number; targetCount: number }
  | { status: "success"; result: SocialGraphSyncResult }
  | { status: "error"; message: string }

interface StepGraphProps {
  readonly stats: SocialGraphSyncStats
  readonly isLoading: boolean
  readonly truncated: boolean
  readonly error: string | null
  readonly intent: GraphIntent
  onChange: (intent: GraphIntent) => void
  importDids: (
    dids: string[],
    opts?: { signal?: AbortSignal },
  ) => Promise<SocialGraphSyncResult>
  /** Called when the runner transitions to success — modal uses this
   *  to enable the Continue button. */
  onSyncDone: (result: SocialGraphSyncResult) => void
}

const PAGE_SIZE = 50

export default function StepGraph({
  stats,
  isLoading,
  truncated,
  error,
  intent,
  onChange,
  importDids,
  onSyncDone,
}: StepGraphProps) {
  const candidateDids = stats.onlyBluesky
  const candidateCount = candidateDids.length
  const overlapCount = stats.inBoth.length
  const canImport = !isLoading && !truncated && !error && candidateCount > 0

  // ---- Picker state (only relevant for intent.kind === "select") -----
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)

  // ---- Sync runner state — owned here so the modal can read the
  // "done" signal without forcing the runner into context.
  const [runner, setRunner] = useState<SyncRunnerState>({ status: "idle" })
  const abortRef = useRef<AbortController | null>(null)

  // Abort any in-flight import on unmount (modal closing, account
  // switch, etc.) so the importDids loop stops between writes.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const startImport = useCallback(
    async (dids: string[]) => {
      if (dids.length === 0) return
      if (runner.status === "running") return
      const controller = new AbortController()
      abortRef.current = controller
      setRunner({
        status: "running",
        importedCount: 0,
        targetCount: dids.length,
      })
      try {
        const result = await importDids(dids, { signal: controller.signal })
        setRunner({ status: "success", result })
        onSyncDone(result)
      } catch (err) {
        setRunner({
          status: "error",
          message: err instanceof Error ? err.message : "Sync failed",
        })
      } finally {
        abortRef.current = null
      }
    },
    [importDids, onSyncDone, runner.status],
  )

  // Live progress signal: certified.inBoth grows as importDids commits
  // each follow (see use-social-graph-sync — certifiedAddFollow updates
  // the local cache after each successful write). We re-render
  // automatically when stats change, but the running counter on the
  // tile needs the snapshot too.
  const liveImportedCount =
    runner.status === "running"
      ? Math.max(
          0,
          runner.targetCount - (candidateCount), // shrinks as overlap grows
        )
      : runner.status === "success"
        ? runner.result.imported
        : 0

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
      <p className="onboarding-step__lede">
        Copy the people you follow on Bluesky into your Certified follow
        graph. You can skip and run this from Settings later.
      </p>

      <div className="onboarding-step__graph-stats">
        <Tile
          label="Now on Certified"
          value={overlapCount}
          highlight={runner.status !== "idle"}
        />
        <Tile
          label="Bluesky-only remaining"
          value={candidateCount}
        />
      </div>

      {runner.status === "running" ? (
        <p className="onboarding-step__progress" role="status">
          Importing…{" "}
          <strong>
            {liveImportedCount}
          </strong>{" "}
          of <strong>{runner.targetCount}</strong>
        </p>
      ) : runner.status === "success" ? (
        <p className="onboarding-step__progress onboarding-step__progress--done">
          Imported {runner.result.imported} of {runner.result.imported + runner.result.failed}.
          {runner.result.failed > 0 ? ` ${runner.result.failed} failed.` : ""}
        </p>
      ) : runner.status === "error" ? (
        <p className="onboarding-step__error" role="alert">
          {runner.message}
        </p>
      ) : null}

      {/* Choices are hidden once a sync has been started — the
          finished/failed state is the user's view. */}
      {runner.status === "idle" && canImport ? (
        <fieldset className="onboarding-step__choice">
          <legend className="onboarding-step__choice-legend">
            What should we do with the {candidateCount}{" "}
            {candidateCount === 1 ? "follow" : "follows"} that aren&apos;t on
            Certified yet?
          </legend>
          <label className="onboarding-step__radio">
            <input
              type="radio"
              name="onboarding-graph-intent"
              checked={intent.kind === "all"}
              onChange={() => onChange({ kind: "all" })}
            />
            <span>
              <strong>Import everything</strong>
              <span className="onboarding-step__radio-desc">
                Follow them all on Certified.
              </span>
            </span>
          </label>
          <label className="onboarding-step__radio">
            <input
              type="radio"
              name="onboarding-graph-intent"
              checked={intent.kind === "select"}
              onChange={() => onChange({ kind: "select" })}
            />
            <span>
              <strong>Pick specific people</strong>
              <span className="onboarding-step__radio-desc">
                Search and tick the ones you want to bring over.
              </span>
            </span>
          </label>
          <label className="onboarding-step__radio">
            <input
              type="radio"
              name="onboarding-graph-intent"
              checked={intent.kind === "skip"}
              onChange={() => onChange({ kind: "skip" })}
            />
            <span>
              <strong>Skip for now</strong>
              <span className="onboarding-step__radio-desc">
                Revisit any time from Settings → Sync social graph.
              </span>
            </span>
          </label>
        </fieldset>
      ) : null}

      {/* Inline picker — only when "select" is the active intent
          AND we haven't started a sync yet. */}
      {runner.status === "idle" && intent.kind === "select" ? (
        <Picker
          candidateDids={candidateDids}
          selected={selected}
          setSelected={setSelected}
          query={query}
          setQuery={setQuery}
          page={page}
          setPage={setPage}
        />
      ) : null}

      {/* Import-trigger button — only when there's something to do
          AND a sync hasn't been started yet. The Continue button in
          the modal footer takes over once the runner is success/skip. */}
      {runner.status === "idle" && canImport && intent.kind !== "skip" ? (
        <div className="onboarding-step__import-actions">
          <Button
            variant="primary"
            onClick={() => {
              if (intent.kind === "all") {
                void startImport(candidateDids)
              } else {
                void startImport(Array.from(selected))
              }
            }}
            disabled={intent.kind === "select" && selected.size === 0}
          >
            {intent.kind === "all"
              ? `Import all ${candidateCount}`
              : selected.size > 0
                ? `Import ${selected.size} selected`
                : "Select people to import"}
          </Button>
        </div>
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
// Inline picker — slim version of the settings sync modal's SelectStep.
// Paginated checkbox list with search; no separate dialog.
// ============================================================================

interface PickerProps {
  candidateDids: string[]
  selected: Set<string>
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  query: string
  setQuery: React.Dispatch<React.SetStateAction<string>>
  page: number
  setPage: React.Dispatch<React.SetStateAction<number>>
}

function Picker({
  candidateDids,
  selected,
  setSelected,
  query,
  setQuery,
  page,
  setPage,
}: PickerProps) {
  const names = useNamesMap(candidateDids)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidateDids
    return candidateDids.filter((d) =>
      (names.get(d) ?? d.toLowerCase()).includes(q),
    )
  }, [candidateDids, query, names])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const startIndex = safePage * PAGE_SIZE
  const pageDids = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  useEffect(() => {
    if (page > totalPages - 1) setPage(0)
  }, [page, totalPages, setPage])

  const toggle = (did: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(did)) next.delete(did)
      else next.add(did)
      return next
    })
  }

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = pageDids.every((d) => next.has(d))
      if (allSelected) pageDids.forEach((d) => next.delete(d))
      else pageDids.forEach((d) => next.add(d))
      return next
    })
  }

  const pageAllSelected =
    pageDids.length > 0 && pageDids.every((d) => selected.has(d))

  return (
    <div className="onboarding-step__picker">
      <label className="onboarding-step__picker-search">
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          placeholder="Search Bluesky-only follows…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(0)
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="onboarding-step__picker-meta">
        <button
          type="button"
          className="onboarding-step__picker-toggle"
          onClick={togglePage}
          disabled={pageDids.length === 0}
        >
          {pageAllSelected ? "Deselect page" : "Select page"}
        </button>
        <span className="onboarding-step__picker-counter">
          {selected.size} selected · {filtered.length}{" "}
          {filtered.length === 1 ? "match" : "matches"}
        </span>
      </div>

      <ul className="onboarding-step__picker-list" role="listbox">
        {pageDids.length === 0 ? (
          <li className="onboarding-step__picker-empty">
            {query.trim() ? `No matches for "${query.trim()}".` : "Empty."}
          </li>
        ) : (
          pageDids.map((d) => (
            <PickerRow
              key={d}
              did={d}
              checked={selected.has(d)}
              onToggle={() => toggle(d)}
            />
          ))
        )}
      </ul>

      {totalPages > 1 ? (
        <div className="onboarding-step__picker-pagination">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
          >
            Previous
          </button>
          <span>
            Page {safePage + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
          >
            Next
          </button>
        </div>
      ) : null}
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
// Kept local so we don't have to refactor that component to export.
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
