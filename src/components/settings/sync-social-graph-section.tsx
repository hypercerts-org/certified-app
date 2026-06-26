"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { ArrowLeft, RefreshCw, Search, Users } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import Checkbox from "@/components/ui/checkbox"
import Input from "@/components/ui/input"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Skeleton from "@/components/ui/skeleton"
import { useAuthorInfo } from "@/hooks/use-author-info"
import {
  useSocialGraphSync,
  type SocialGraphSyncResult,
} from "@/hooks/use-social-graph-sync"
import { getInitials } from "@/lib/utils/initials"

interface SyncSocialGraphSectionProps {
  /**
   * DID whose social graph we're comparing — personal or group.
   * The certified + bluesky follows are both read from this repo.
   */
  readonly did: string
  /**
   * DID that authors the new follow records. For personal: equal
   * to `did`. For group: the personal session DID, since the BFF
   * route authorises against the session and writes to the group.
   */
  readonly ownDid: string
  /**
   * Set to the group DID when acting-as-group — causes the import
   * writes to go through `/api/groups/[did]/follow` instead of the
   * personal XRPC proxy. Omit for personal sync.
   */
  readonly targetDid?: string
}

/**
 * Settings section: compare the viewer's certified follow graph
 * against their bluesky follow graph, with a one-click sync that
 * either imports every bluesky follow into certified, or lets the
 * viewer pick a subset.
 *
 * Rendered on both `/profile/<own-handle>?tab=settings` (personal)
 * and the org-settings panel (group). The personal flow writes
 * follows on the personal repo; the group flow writes on the group's
 * repo via the BFF.
 */
type SyncDirection = "import" | "export"

/** Direction-specific copy so one modal serves both Bluesky → Certified
 *  (import) and Certified → Bluesky (export). */
interface DirectionCopy {
  /** Modal + action title, e.g. "Sync from Bluesky". */
  title: string
  /** Graph the candidates come from. */
  source: string
  /** Graph we write to. */
  target: string
  /** Action verb, e.g. "Import" / "Add". */
  verb: string
  /** Lower-case verb for inline copy. */
  verbLower: string
  /** Past-tense verb for the result line. */
  verbPast: string
}

const IMPORT_COPY: DirectionCopy = {
  title: "Sync from Bluesky",
  source: "Bluesky",
  target: "Certified",
  verb: "Import",
  verbLower: "import",
  verbPast: "Imported",
}

const EXPORT_COPY: DirectionCopy = {
  title: "Sync to Bluesky",
  source: "Certified",
  target: "Bluesky",
  verb: "Add",
  verbLower: "add",
  verbPast: "Added",
}

export default function SyncSocialGraphSection({
  did,
  ownDid,
  targetDid,
}: SyncSocialGraphSectionProps) {
  const sync = useSocialGraphSync(did, { ownDid, targetDid })
  const [modalDir, setModalDir] = useState<SyncDirection | null>(null)

  const summary = sync.isLoading ? "Comparing graphs…" : null
  const onlyCertified = sync.stats.onlyCertified.length
  const onlyBluesky = sync.stats.onlyBluesky.length
  const inSync =
    !sync.isLoading &&
    !sync.truncated &&
    !sync.blueskyTruncated &&
    onlyCertified === 0 &&
    onlyBluesky === 0

  return (
    <div className="social-graph-sync" data-tour="settings-bsky-sync">
      <div className="social-graph-sync__stats">
        <StatTile
          label="Followed on both"
          value={sync.stats.inBoth.length}
          isLoading={sync.isLoading}
        />
        <StatTile
          label="Only on Certified"
          value={onlyCertified}
          isLoading={sync.isLoading}
          highlight={onlyCertified > 0}
        />
        <StatTile
          label="Only on Bluesky"
          value={onlyBluesky}
          isLoading={sync.isLoading}
          highlight={onlyBluesky > 0}
        />
      </div>

      {sync.error ? (
        <p className="social-graph-sync__error" role="alert">
          {sync.error}
        </p>
      ) : sync.truncated || sync.blueskyTruncated ? (
        <p className="social-graph-sync__error" role="alert">
          One of your follow lists is too large to compare safely (more than
          10,000 follows). Syncing would risk creating duplicate records — it&apos;s
          disabled.
        </p>
      ) : summary ? (
        <p className="social-graph-sync__summary">{summary}</p>
      ) : null}

      {modalDir ? (
        <SyncFlow
          copy={modalDir === "import" ? IMPORT_COPY : EXPORT_COPY}
          candidateDids={
            modalDir === "import"
              ? sync.stats.onlyBluesky
              : sync.stats.onlyCertified
          }
          onClose={() => setModalDir(null)}
          onImport={(dids, opts) =>
            modalDir === "import"
              ? sync.importDids(dids, opts)
              : sync.exportDids(dids, opts)
          }
        />
      ) : (
        <>
          <div className="social-graph-sync__actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setModalDir("import")}
              disabled={sync.isLoading || sync.truncated || onlyBluesky === 0}
            >
              <RefreshCw size={14} strokeWidth={1.75} aria-hidden />
              Sync from Bluesky
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setModalDir("export")}
              disabled={
                sync.isLoading || sync.blueskyTruncated || onlyCertified === 0
              }
            >
              <RefreshCw size={14} strokeWidth={1.75} aria-hidden />
              Sync to Bluesky
            </Button>
          </div>

          {inSync ? (
            <span className="social-graph-sync__hint">
              Your Certified and Bluesky follows are already in sync.
            </span>
          ) : null}
        </>
      )}
    </div>
  )
}

interface StatTileProps {
  label: string
  value: number
  isLoading: boolean
  highlight?: boolean
}

function StatTile({ label, value, isLoading, highlight }: StatTileProps) {
  return (
    <div
      className={`social-graph-sync__tile${
        highlight ? " social-graph-sync__tile--highlight" : ""
      }`}
    >
      <span className="social-graph-sync__tile-value">
        {isLoading ? "—" : new Intl.NumberFormat().format(value)}
      </span>
      <span className="social-graph-sync__tile-label">{label}</span>
    </div>
  )
}

// ========================= Sync flow (inline) =========================

type ModalStep = "choose" | "select"

interface SyncModalProps {
  copy: DirectionCopy
  candidateDids: string[]
  onClose: () => void
  onImport: (
    dids: string[],
    opts?: { signal?: AbortSignal },
  ) => Promise<SocialGraphSyncResult>
}

const PAGE_SIZE = 50

function SyncFlow({ copy, candidateDids, onClose, onImport }: SyncModalProps) {
  const [step, setStep] = useState<ModalStep>("choose")
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<SocialGraphSyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)

  // AbortController scoped to the flow's lifetime. If the flow unmounts
  // (user cancels, navigates away) mid-import, abort() signals the
  // importDids loop to stop after the current write — otherwise it keeps
  // writing follows to the user's repo and populating the local cache with
  // rows they thought they cancelled.
  const abortControllerRef = useRef<AbortController | null>(null)

  // Abort any in-flight import when the flow unmounts (Cancel / leaving the
  // page).
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const runImport = useCallback(
    async (dids: string[]) => {
      if (isImporting) return
      const controller = new AbortController()
      abortControllerRef.current = controller
      setIsImporting(true)
      setError(null)
      try {
        const out = await onImport(dids, { signal: controller.signal })
        setResult(out)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sync failed")
      } finally {
        setIsImporting(false)
        abortControllerRef.current = null
      }
    },
    [isImporting, onImport],
  )

  return (
    <div
      className="social-graph-sync__flow"
      role="region"
      aria-label="Sync social graph"
    >
      <div className="social-graph-sync__flow-head">
        {step === "select" && !result ? (
          <button
            type="button"
            className="social-graph-sync__modal-back"
            onClick={() => {
              if (isImporting) return
              setStep("choose")
              setError(null)
            }}
            aria-label="Back to sync options"
            disabled={isImporting}
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
        <h3 className="social-graph-sync__flow-title">
          {result
            ? "Sync complete"
            : step === "choose"
              ? copy.title
              : `Select people to ${copy.verbLower}`}
        </h3>
      </div>

      <div className="social-graph-sync__modal-body">
        {result ? (
          <ResultView
            copy={copy}
            result={result}
            candidateCount={candidateDids.length}
            onClose={onClose}
          />
        ) : step === "choose" ? (
          <ChooseStep
            copy={copy}
            candidateCount={candidateDids.length}
            isImporting={isImporting}
            error={error}
            onCancel={onClose}
            onImportAll={() => runImport(candidateDids)}
            onPick={() => setStep("select")}
          />
        ) : (
          <SelectStep
            copy={copy}
            candidateDids={candidateDids}
            selected={selected}
            setSelected={setSelected}
            query={query}
            setQuery={setQuery}
            page={page}
            setPage={setPage}
            isImporting={isImporting}
            error={error}
            onCancel={onClose}
            onImport={() => runImport(Array.from(selected))}
          />
        )}
      </div>
    </div>
  )
}

// ---------------- Step 1: choose import-all vs pick ----------------

interface ChooseStepProps {
  copy: DirectionCopy
  candidateCount: number
  isImporting: boolean
  error: string | null
  onCancel: () => void
  onImportAll: () => void
  onPick: () => void
}

function ChooseStep({
  copy,
  candidateCount,
  isImporting,
  error,
  onCancel,
  onImportAll,
  onPick,
}: ChooseStepProps) {
  return (
    <>
      <p className="social-graph-sync__modal-lede">
        You follow <strong>{candidateCount}</strong>{" "}
        {candidateCount === 1 ? "person" : "people"} on {copy.source} who you
        don’t follow yet on {copy.target}.
      </p>

      <div className="social-graph-sync__modal-choices">
        <button
          type="button"
          className="social-graph-sync__modal-choice"
          onClick={onImportAll}
          disabled={isImporting || candidateCount === 0}
        >
          <span className="social-graph-sync__modal-choice-title">
            {copy.verb} all
          </span>
          <span className="social-graph-sync__modal-choice-desc">
            Follow everyone from your {copy.source} graph on {copy.target} in
            one batch.
          </span>
        </button>
        <button
          type="button"
          className="social-graph-sync__modal-choice"
          onClick={onPick}
          disabled={isImporting || candidateCount === 0}
        >
          <span className="social-graph-sync__modal-choice-title">
            {copy.verb} selected
          </span>
          <span className="social-graph-sync__modal-choice-desc">
            Pick exactly who to add. Search + pagination across all{" "}
            {candidateCount} candidates.
          </span>
        </button>
      </div>

      {error ? (
        <p className="social-graph-sync__modal-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="social-graph-sync__modal-footer">
        <Button variant="ghost" onClick={onCancel} disabled={isImporting}>
          Cancel
        </Button>
        {isImporting ? (
          <span className="social-graph-sync__modal-progress">
            <LoadingSpinner size="sm" /> Writing…
          </span>
        ) : null}
      </div>
    </>
  )
}

// -------------------- Step 2: pick a subset --------------------------

interface SelectStepProps {
  copy: DirectionCopy
  candidateDids: string[]
  selected: Set<string>
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  query: string
  setQuery: React.Dispatch<React.SetStateAction<string>>
  page: number
  setPage: React.Dispatch<React.SetStateAction<number>>
  isImporting: boolean
  error: string | null
  onCancel: () => void
  onImport: () => void
}

function SelectStep({
  copy,
  candidateDids,
  selected,
  setSelected,
  query,
  setQuery,
  page,
  setPage,
  isImporting,
  error,
  onCancel,
  onImport,
}: SelectStepProps) {
  // Resolve names so search can match on handle / displayName, not
  // just DIDs. Names hydrate progressively — the filter recomputes
  // whenever a new name lands.
  const names = useNamesMap(candidateDids)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidateDids
    return candidateDids.filter((d) => {
      const name = names.get(d) ?? d.toLowerCase()
      return name.includes(q)
    })
  }, [candidateDids, query, names])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const startIndex = safePage * PAGE_SIZE
  const pageDids = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  // Reset to the first page whenever the filtered set shrinks past
  // the current page.
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
    <>
      <Input
        type="search"
        size="sm"
        leadingIcon={<Search size={16} strokeWidth={1.75} aria-hidden />}
        placeholder={`Search ${copy.source}-only follows…`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setPage(0)
        }}
        aria-label="Search candidates"
        autoComplete="off"
        spellCheck={false}
      />

      <div className="social-graph-sync__modal-meta">
        <button
          type="button"
          className="social-graph-sync__modal-select-page"
          onClick={togglePage}
          disabled={pageDids.length === 0 || isImporting}
        >
          {pageAllSelected ? "Deselect this page" : "Select this page"}
        </button>
        <span className="social-graph-sync__modal-counter">
          {selected.size} selected · {filtered.length}{" "}
          {filtered.length === 1 ? "match" : "matches"}
        </span>
      </div>

      <ul className="social-graph-sync__modal-list" role="listbox" aria-label={`${copy.source}-only follows`}>
        {pageDids.map((d) => (
          <CandidateRow
            key={d}
            did={d}
            checked={selected.has(d)}
            onToggle={() => toggle(d)}
            disabled={isImporting}
          />
        ))}
        {pageDids.length === 0 ? (
          <li className="social-graph-sync__modal-empty">
            {query.trim()
              ? `No matches for "${query.trim()}".`
              : `Nothing to ${copy.verbLower}.`}
          </li>
        ) : null}
      </ul>

      {totalPages > 1 ? (
        <div className="social-graph-sync__modal-pagination">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0 || isImporting}
          >
            Previous
          </Button>
          <span className="social-graph-sync__modal-page-status">
            Page {safePage + 1} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1 || isImporting}
          >
            Next
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="social-graph-sync__modal-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="social-graph-sync__modal-footer">
        <Button variant="ghost" onClick={onCancel} disabled={isImporting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onImport}
          loading={isImporting}
          disabled={isImporting || selected.size === 0}
        >
          {selected.size > 1
            ? `${copy.verb} ${selected.size} selected`
            : `${copy.verb} selected`}
        </Button>
      </div>
    </>
  )
}

interface CandidateRowProps {
  did: string
  checked: boolean
  onToggle: () => void
  disabled: boolean
}

function CandidateRow({ did, checked, onToggle, disabled }: CandidateRowProps) {
  const { info, isLoading } = useAuthorInfo(did)
  const name = info?.displayName || info?.handle || did
  const handle = info?.handle && info.handle !== info.did ? info.handle : null

  return (
    <li className="social-graph-sync__modal-row">
      <Checkbox
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="social-graph-sync__modal-row-label"
        label={
          <span className="social-graph-sync__modal-row-content">
            {isLoading && !info ? (
              <Skeleton circle width={32} height={32} animate={false} />
            ) : (
              <Avatar
                size="sm"
                src={info?.avatarUrl || undefined}
                fallbackInitials={getInitials(info?.displayName, did)}
              />
            )}
            <span className="social-graph-sync__modal-row-info">
              <span className="social-graph-sync__modal-row-name">{name}</span>
              {handle ? (
                <span className="social-graph-sync__modal-row-handle">
                  @{handle}
                </span>
              ) : null}
            </span>
          </span>
        }
      />
    </li>
  )
}

// --------------------------- Result view ----------------------------

interface ResultViewProps {
  copy: DirectionCopy
  result: SocialGraphSyncResult
  candidateCount: number
  onClose: () => void
}

function ResultView({ copy, result, candidateCount, onClose }: ResultViewProps) {
  return (
    <>
      <div className="social-graph-sync__result">
        <Users
          size={20}
          strokeWidth={1.75}
          className="social-graph-sync__result-icon"
          aria-hidden
        />
        <p className="social-graph-sync__result-text">
          {copy.verbPast}{" "}
          <strong>
            {result.imported} of {candidateCount}
          </strong>{" "}
          {result.imported === 1 ? "follow" : "follows"} into the {copy.target}{" "}
          graph.
          {result.failed > 0 ? (
            <>
              {" "}
              <span className="social-graph-sync__result-failed">
                {result.failed} failed.
              </span>
            </>
          ) : null}
        </p>
      </div>

      {result.errors.length > 0 ? (
        <details className="social-graph-sync__result-details">
          <summary>Show errors</summary>
          <ul>
            {result.errors.map((e) => (
              <li key={e.subjectDid}>
                <code>{e.subjectDid}</code> — {e.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="social-graph-sync__modal-footer">
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </>
  )
}

// -------------------------- Names cache -----------------------------

// Module-level cache mirroring the pattern in profile-endorsements
// + profile-followers: keeps name lookups synchronous in the
// filter/sort path while resolution happens in the background.
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
