"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import AppDialog, { AppDialogHeader, AppDialogBody } from "@/components/ui/app-dialog"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { fetchIndexerActivities, INDEXER_PROXY_URL } from "@/lib/atproto/indexer"
import { searchMergedActors } from "@/lib/atproto/actor-search"
import {
  ITEM_NSID,
  LIST_ACCOUNTS_TYPE,
  LIST_CERTS_TYPE,
  itemUriMatchesType,
  resolveRecordCid,
  type TypedListType,
} from "@/lib/atproto/typed-lists"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { getInitials } from "@/lib/utils/initials"

// The three modals ProfileLists opens: create/edit a list, bulk-add by
// pasted at-URI, and search-driven add. Each keeps its own form state;
// the parent only supplies the list type + membership and the write
// callbacks.

// ----------------------------- Create / edit modal -----------------------------

export function CreateListModal({
  mode = "create",
  type,
  initialTitle = "",
  initialDescription = "",
  onSubmit,
  onCancel,
}: {
  /** `"create"` (default) shows the Create wording; `"edit"` swaps in
   *  the Save wording and pre-fills the title + description. The
   *  underlying form chrome is identical so both modes read as the
   *  same UI surface. */
  mode?: "create" | "edit"
  type: TypedListType
  initialTitle?: string
  initialDescription?: string
  onSubmit: (title: string, description?: string) => Promise<void>
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [isWriting, setIsWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isWriting || !title.trim()) return
    setIsWriting(true)
    setError(null)
    try {
      await onSubmit(title.trim(), description.trim() || undefined)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "edit"
            ? "Failed to save list"
            : "Failed to create list",
      )
      setIsWriting(false)
    }
  }

  const titleCopy = mode === "edit" ? `Edit ${LABELS[type]} list` : `Create ${LABELS[type]} list`
  const submitCopy = mode === "edit" ? "Save" : "Create list"

  return (
    <AppDialog
      ariaLabel={titleCopy}
      maxWidth={460}
      onClose={() => !isWriting && onCancel()}
      disableBackdropClose={isWriting}
    >
      <AppDialogHeader
        title={titleCopy}
        onClose={() => !isWriting && onCancel()}
        disabled={isWriting}
      />
      <form className="px-5 pb-5 pt-4 profile-lists__create-form" onSubmit={submit}>
        <label className="profile-lists__create-field">
          <span className="profile-lists__create-label">Name</span>
          <input
            ref={inputRef}
            className="profile-lists__create-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            disabled={isWriting}
            placeholder="e.g. Favourite work"
            required
          />
        </label>
        <label className="profile-lists__create-field">
          <span className="profile-lists__create-label">Description (optional)</span>
          <textarea
            className="profile-lists__create-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            disabled={isWriting}
          />
        </label>
        {error ? (
          <p className="profile-lists__create-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="profile-lists__create-actions">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isWriting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isWriting} disabled={isWriting || !title.trim()}>
            {submitCopy}
          </Button>
        </div>
      </form>
    </AppDialog>
  )
}

const LABELS: Record<TypedListType, string> = {
  "list:certs": "activities",
  "list:projects": "projects",
  "list:accounts": "accounts",
}

// ----------------------------- Add-items modal -----------------------------

interface SearchResult {
  uri: string
  cid: string
  title: string
  subtitle?: string | null
  imageUrl?: string | null
  avatarUrl?: string | null
  initials?: string | null
}

// ----------------------------- Bulk-paste modal -----------------------------

interface ParseRow {
  uri: string
  status: "pending" | "writing" | "added" | "already" | "wrong-type" | "missing" | "error"
  message?: string
}

export function PasteUrisModal({
  type,
  alreadyIn,
  onAddMany,
  onClose,
}: {
  type: TypedListType
  alreadyIn: Set<string>
  onAddMany: (
    items: readonly { uri: string; cid: string }[],
  ) => Promise<unknown>
  onClose: () => void
}) {
  const [raw, setRaw] = useState("")
  const [rows, setRows] = useState<ParseRow[]>([])
  const [running, setRunning] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleRun = useCallback(async () => {
    if (running) return
    // Accept commas, newlines, and whitespace as separators so users
    // can paste a list of URIs from any reasonable source without
    // hand-formatting it. Dedupe within the input.
    // Accounts list: accept a bare DID (`did:plc:…`) or an actor URI
    // (`at://did:plc:…`), with or without a trailing slash, and expand it
    // to the conventional profile record path
    // (`at://<did>/app.certified.actor.profile/self`) before validation —
    // the profile record's rkey is always `self`. For certs / projects the
    // rkey is record-specific, so those URIs are left untouched.
    const normalize = (uri: string): string => {
      if (type !== LIST_ACCOUNTS_TYPE) return uri
      const m = uri.match(/^(?:at:\/\/)?(did:[a-z]+:[A-Za-z0-9._:-]+)\/?$/)
      return m ? `at://${m[1]}/${ITEM_NSID[LIST_ACCOUNTS_TYPE]}/self` : uri
    }

    const parsed = Array.from(
      new Set(
        raw
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map(normalize),
      ),
    )
    if (parsed.length === 0) return

    const initial: ParseRow[] = parsed.map((uri) => {
      if (!uri.startsWith("at://")) {
        return { uri, status: "error", message: "Not an at:// URI" }
      }
      if (!itemUriMatchesType(uri, type)) {
        return { uri, status: "wrong-type", message: `Doesn't match ${ITEM_NSID[type]}` }
      }
      if (alreadyIn.has(uri)) {
        return { uri, status: "already", message: "Already in list" }
      }
      return { uri, status: "pending" }
    })
    setRows(initial)
    setRunning(true)

    // Phase 1: parallel CID resolution. Each row flips to "writing"
    // as its lookup starts, then either "missing" (no record) or
    // stays writeable. This is the long pole — CID resolution is
    // a PDS round-trip per URI but the requests fan out in parallel.
    const writable = initial.filter((r) => r.status === "pending")
    const resolved = await Promise.all(
      writable.map(async (row) => {
        setRows((prev) =>
          prev.map((r) =>
            r.uri === row.uri ? { ...r, status: "writing" } : r,
          ),
        )
        try {
          const cid = await resolveRecordCid(row.uri)
          if (!cid) {
            setRows((prev) =>
              prev.map((r) =>
                r.uri === row.uri
                  ? { ...r, status: "missing", message: "Record not found on PDS" }
                  : r,
              ),
            )
            return null
          }
          return { uri: row.uri, cid }
        } catch (err) {
          setRows((prev) =>
            prev.map((r) =>
              r.uri === row.uri
                ? {
                    ...r,
                    status: "error",
                    message: err instanceof Error ? err.message : "Lookup failed",
                  }
                : r,
            ),
          )
          return null
        }
      }),
    )

    // Phase 2: single bulk append. One getRecord + one putRecord on
    // the list, regardless of how many items got resolved — much
    // cheaper than the prior per-item RMW loop. If the swap fails
    // (concurrent edit), every row that would've been added is
    // marked error so the viewer can retry.
    const validItems = resolved.filter(
      (r): r is { uri: string; cid: string } => r !== null,
    )
    if (validItems.length > 0) {
      try {
        await onAddMany(validItems)
        const validUris = new Set(validItems.map((it) => it.uri))
        setRows((prev) =>
          prev.map((r) =>
            validUris.has(r.uri)
              ? { ...r, status: "added", message: undefined }
              : r,
          ),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : "Add failed"
        const validUris = new Set(validItems.map((it) => it.uri))
        setRows((prev) =>
          prev.map((r) =>
            validUris.has(r.uri) ? { ...r, status: "error", message } : r,
          ),
        )
      }
    }
    setRunning(false)
  }, [alreadyIn, onAddMany, raw, running, type])

  return (
    <AppDialog
      ariaLabel="Bulk add by at-URI"
      maxWidth={600}
      onClose={() => !running && onClose()}
      disableBackdropClose={running}
    >
      <AppDialogHeader
        title="Bulk add by at-URI"
        onClose={() => !running && onClose()}
        disabled={running}
      />
      <AppDialogBody className="profile-lists__paste-body">
        <p className="profile-lists__paste-help">
          Paste at-URIs separated by commas, newlines, or spaces.
          Only items matching{" "}
          <code className="profile-lists__paste-nsid">{ITEM_NSID[type]}</code>{" "}
          will be added.
          {type === LIST_ACCOUNTS_TYPE ? (
            <>
              {" "}For accounts a bare DID{" "}
              <code className="profile-lists__paste-nsid">did:plc:…</code>{" "}
              (with or without <code className="profile-lists__paste-nsid">at://</code>)
              is also accepted — we&rsquo;ll expand it to the profile record.
            </>
          ) : null}
        </p>
        <textarea
          ref={textareaRef}
          className="profile-lists__paste-textarea"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={6}
          placeholder={
            type === LIST_ACCOUNTS_TYPE
              ? "did:plc:…, did:plc:…, …"
              : "at://did:plc:…/…/abc123, at://did:plc:…/…/def456, …"
          }
          disabled={running}
        />
        {rows.length > 0 ? (
          <>
            <PasteProgress rows={rows} running={running} />
            <ul className="profile-lists__paste-results" aria-live="polite">
              {rows.map((r) => (
                <li key={r.uri} className={`profile-lists__paste-row profile-lists__paste-row--${r.status}`}>
                  <span className="profile-lists__paste-status">{statusLabel(r.status)}</span>
                  <code className="profile-lists__paste-uri">{r.uri}</code>
                  {r.message ? (
                    <span className="profile-lists__paste-message">{r.message}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="profile-lists__paste-actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={running}>
            {rows.some((r) => r.status === "added") ? "Done" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleRun}
            loading={running}
            disabled={running || raw.trim().length === 0}
          >
            Add
          </Button>
        </div>
      </AppDialogBody>
    </AppDialog>
  )
}

function statusLabel(s: ParseRow["status"]): string {
  switch (s) {
    case "pending":
      return "Pending"
    case "writing":
      return "Writing…"
    case "added":
      return "Added"
    case "already":
      return "Already in"
    case "wrong-type":
      return "Wrong type"
    case "missing":
      return "Not found"
    case "error":
      return "Error"
  }
}

/**
 * Overall progress strip above the per-row results list. Shows a
 * spinner + "N of M done" while the run is in flight, and a filled
 * progress bar that animates from 0% → 100%. After the loop ends
 * the spinner drops; the counter stays so the viewer has a record
 * of what landed. `aria-live="polite"` so screen readers get
 * progress updates without the page yanking focus around.
 */
function PasteProgress({
  rows,
  running,
}: {
  rows: ParseRow[]
  running: boolean
}) {
  const total = rows.length
  // "Resolved" = anything that's no longer pending / writing. Counts
  // every terminal state (added / already / wrong-type / missing /
  // error) so the bar fills as the loop progresses regardless of
  // whether each row succeeded.
  const resolved = rows.filter(
    (r) => r.status !== "pending" && r.status !== "writing",
  ).length
  const added = rows.filter((r) => r.status === "added").length
  const percent = total === 0 ? 0 : Math.round((resolved / total) * 100)
  return (
    <div className="profile-lists__paste-progress" aria-live="polite">
      <div className="profile-lists__paste-progress-row">
        {running ? (
          <LoadingSpinner size="sm" />
        ) : null}
        <span className="profile-lists__paste-progress-label">
          {running
            ? `Adding ${resolved} of ${total}…`
            : `${added} of ${total} added`}
        </span>
        <span className="profile-lists__paste-progress-percent">{percent}%</span>
      </div>
      <div
        className="profile-lists__paste-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={resolved}
      >
        <div
          className="profile-lists__paste-progress-bar-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export function AddItemsModal({
  type,
  alreadyIn,
  onAdd,
  onClose,
}: {
  type: TypedListType
  alreadyIn: Set<string>
  onAdd: (item: { uri: string; cid: string }) => Promise<unknown>
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingUri, setAddingUri] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced search keyed by query. Empty query clears results
  // immediately rather than firing a "show me everything" request.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResults([])
      setSearching(false)
      setError(null)
      return
    }
    setSearching(true)
    const controller = new AbortController()
    const handle = window.setTimeout(async () => {
      try {
        const next = await runSearch(type, trimmed, controller.signal)
        if (controller.signal.aborted) return
        setResults(next)
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Search failed")
        setResults([])
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 250)
    return () => {
      controller.abort()
      window.clearTimeout(handle)
    }
  }, [type, query])

  const handleAdd = async (result: SearchResult) => {
    if (addingUri) return
    setAddingUri(result.uri)
    try {
      // Bluesky's actor search doesn't return profile-record CIDs, so
      // for account-list items we resolve the CID on click before
      // writing the strongRef. Cert + project searches already carry
      // the CID inline from the indexer.
      const cid = result.cid || (await resolveRecordCid(result.uri))
      if (!cid) throw new Error("Couldn't resolve record CID")
      await onAdd({ uri: result.uri, cid })
    } catch (err) {
      console.error("Failed to add item:", err)
      setError(err instanceof Error ? err.message : "Failed to add item")
    } finally {
      setAddingUri(null)
    }
  }

  return (
    <AppDialog
      ariaLabel={`Add ${LABELS[type]} to list`}
      maxWidth={520}
      onClose={onClose}
    >
      <AppDialogHeader
        title={`Add ${LABELS[type]} to list`}
        onClose={onClose}
      />
      <AppDialogBody className="profile-lists__add-body">
        <label className="profile-lists__add-search">
          <Search size={14} strokeWidth={1.75} aria-hidden />
          <input
            ref={inputRef}
            className="profile-lists__add-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={SEARCH_PLACEHOLDERS[type]}
          />
        </label>
        {error ? (
          <p className="profile-lists__add-error" role="alert">
            {error}
          </p>
        ) : null}
        {searching ? (
          <div className="profile-lists__add-spinner">
            <LoadingSpinner size="sm" />
          </div>
        ) : query.trim() && results.length === 0 ? (
          <p className="profile-lists__add-empty">No matches.</p>
        ) : results.length > 0 ? (
          <ul className="profile-lists__add-results">
            {results.map((r) => {
              const isIn = alreadyIn.has(r.uri)
              return (
                <li key={r.uri}>
                  <div className="profile-lists__add-row">
                    <span className="profile-lists__add-avatar">
                      {r.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={r.imageUrl} alt="" className="profile-lists__thumb" />
                      ) : type === LIST_ACCOUNTS_TYPE ? (
                        <Avatar
                          size="sm"
                          src={r.avatarUrl ?? undefined}
                          alt=""
                          fallbackInitials={r.initials ?? ""}
                        />
                      ) : (
                        <span className="profile-lists__thumb profile-lists__thumb--placeholder" />
                      )}
                    </span>
                    <span className="profile-lists__add-body">
                      <span className="profile-lists__add-title">{r.title}</span>
                      {r.subtitle ? (
                        <span className="profile-lists__add-subtitle">{r.subtitle}</span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant={isIn ? "ghost" : "primary"}
                      size="sm"
                      onClick={() => handleAdd(r)}
                      loading={addingUri === r.uri}
                      disabled={isIn || (!!addingUri && addingUri !== r.uri)}
                    >
                      {isIn ? "Added" : "Add"}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </AppDialogBody>
    </AppDialog>
  )
}

const SEARCH_PLACEHOLDERS: Record<TypedListType, string> = {
  "list:certs": "Search activities by title",
  "list:projects": "Search projects by title",
  "list:accounts": "Search accounts by handle or name",
}

// ----------------------------- Search drivers -----------------------------

async function runSearch(
  type: TypedListType,
  query: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  if (type === LIST_ACCOUNTS_TYPE) return searchAccounts(query, signal)
  if (type === LIST_CERTS_TYPE) return searchCerts(query, signal)
  return searchProjects(query, signal)
}

async function searchAccounts(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  // Account-list membership must NOT require a Certified profile, so search
  // Certified + Bluesky merged (see `searchMergedActors`). Each result
  // strong-refs the profile record it actually has (`profileNsid`) — rkey
  // is the literal "self" — so the URI always targets an existing record
  // and `resolveRecordCid` succeeds on add.
  const merged = await searchMergedActors(query, signal)
  return merged.map((a) => ({
    uri: `at://${a.did}/${a.profileNsid}/self`,
    cid: "",
    title: a.displayName || (a.handle ? `@${a.handle}` : a.did),
    subtitle: a.handle ? `@${a.handle}` : null,
    avatarUrl: a.avatarUrl,
    initials: getInitials(a.displayName, a.handle ?? a.did),
  }))
}

async function searchCerts(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const result = await fetchIndexerActivities({
    first: 10,
    search: query,
    signal,
  })
  const out: SearchResult[] = []
  for (const rec of result.records) {
    const parsed = parseAtUri(rec.uri)
    const imageUrl =
      rec.value.image && parsed
        ? resolveActivityImageUrl(rec.value.image, parsed.did)
        : null
    out.push({
      uri: rec.uri,
      cid: rec.cid,
      title:
        typeof rec.value.title === "string" && rec.value.title.length > 0
          ? rec.value.title
          : "Untitled activity",
      subtitle: null,
      imageUrl,
    })
  }
  return out
}

interface ProjectsResponse {
  data?: {
    orgHypercertsCollection?: {
      edges: {
        node: {
          uri: string
          cid: string
          title: string | null
          shortDescription: string | null
        } | null
      }[]
    } | null
  } | null
}

async function searchProjects(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const res = await fetch(INDEXER_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "Projects",
      variables: { first: 10, after: null, authors: null, search: query },
    }),
    signal,
  })
  if (!res.ok) throw new Error(`Project search failed: ${res.status}`)
  const json = (await res.json()) as ProjectsResponse
  const out: SearchResult[] = []
  for (const edge of json.data?.orgHypercertsCollection?.edges ?? []) {
    if (!edge.node) continue
    out.push({
      uri: edge.node.uri,
      cid: edge.node.cid,
      title: edge.node.title?.trim() || "Untitled project",
      subtitle: edge.node.shortDescription || null,
    })
  }
  return out
}
