"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowUpDown,
  Award,
  ChevronDown,
  Filter as FilterIcon,
  FolderGit2,
  LayoutGrid,
  List as ListIcon,
  Search,
  Users,
} from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import ActivityCard from "@/components/feed/activity-card"
import CertListRow from "./cert-list-row"
import ExploreUserCard from "./explore-user-card"
import ExploreProjectCard from "./explore-project-card"
import ProjectListRow from "./project-list-row"
import AccountListRow from "./account-list-row"
import {
  SUB_OPTIONS,
  defaultFilterForKind,
  filtersForKind,
  parseSubForKind,
  type ExploreKind,
  type SortOrder,
} from "./explore-types"
import { useExploreData } from "@/hooks/use-explore"
import { useAuth } from "@/lib/auth/auth-context"
import { usePageTitle } from "@/lib/navbar-context"


const SORT_LABEL: Record<SortOrder, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  alphabetical: "Alphabetical",
}

function parseKind(v: string | null): ExploreKind {
  if (v === "accounts" || v === "projects" || v === "certs") return v
  // Migration shim — old URLs with ?kind=users or ?kind=profiles still
  // resolve to accounts so external links keep working.
  if (v === "users" || v === "profiles") return "accounts"
  return "certs"
}

function parseSort(v: string | null): SortOrder {
  if (v === "newest" || v === "oldest" || v === "alphabetical") return v
  return "newest"
}

type ListGalleryView = "list" | "gallery"
function parseView(v: string | null): ListGalleryView {
  return v === "gallery" ? "gallery" : "list"
}

function parseDegree(v: string | null): 1 | 2 | 3 {
  if (v === "2") return 2
  if (v === "3") return 3
  return 1
}

/**
 * The filter keys that consume the endorsement-graph closure
 * (magic-indexer #117). When the active filter is in this set,
 * the degree-selector renders above the results and the loader
 * threads `degree` into `fetchEndorsementClosure`.
 */
function isEndorsementFilter(kind: ExploreKind, filter: string): boolean {
  if (kind === "accounts") return filter === "endorsed"
  return filter === "by-endorsed"
}


function isValidFilter(kind: ExploreKind, filter: string): boolean {
  return filtersForKind(kind).some((f) => f.key === filter)
}

export default function Explore() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const kind = parseKind(searchParams?.get("kind") ?? null)
  const rawFilter = searchParams?.get("filter") ?? null
  const filter = rawFilter && isValidFilter(kind, rawFilter)
    ? rawFilter
    : defaultFilterForKind(kind)
  const sub = parseSubForKind(kind, searchParams?.get("sub") ?? null)
  const search = searchParams?.get("q") ?? ""
  const sort = parseSort(searchParams?.get("sort") ?? null)
  const view = parseView(searchParams?.get("view") ?? null)
  const degree = parseDegree(searchParams?.get("degree") ?? null)
  const showsDegreeControl = isEndorsementFilter(kind, filter)
  const { did: viewerDid } = useAuth()

  // Client-side filter chip(s) — kind-specific simple boolean attributes
  // captured in URL as a comma-separated list under `attrs=`.
  const attrsParam = searchParams?.get("attrs") ?? ""
  const attrs = useMemo(
    () => new Set(attrsParam.split(",").filter(Boolean)),
    [attrsParam],
  )

  const setUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") params.delete(k)
        else params.set(k, v)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, searchParams, router],
  )

  // Read the target's `data-*` attribute instead of capturing the
  // iteration variable in a closure. The SWC minifier (Next 16's
  // default prod-build pipeline) was hoisting `f` out of the per-
  // iteration `.map()` scope and sharing it across every button's
  // onClick — meaning every sidebar filter ended up calling
  // setUrl({ filter: <last_filter_key> }), which on certs is "all"
  // and produces no observable change. Reading from the DOM dataset
  // is minifier-proof because there's no captured variable. Same
  // pattern applied to the sub-category dropdown's option buttons
  // below.
  const onFilterButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const key = e.currentTarget.dataset.filterKey
      if (key) setUrl({ filter: key })
    },
    [setUrl],
  )

  const onSubOptionClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const key = e.currentTarget.dataset.subKey
      if (key) {
        setUrl({ sub: key === "all" ? null : key })
        setSubPrefixOpen(false)
      }
    },
    [setUrl],
  )

  const onSortOptionClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const key = e.currentTarget.dataset.sortKey
      if (key) {
        setUrl({ sort: key === "newest" ? null : key })
        setSortOpen(false)
      }
    },
    [setUrl],
  )

  const onAttrToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const key = e.currentTarget.dataset.attrKey
      if (!key) return
      const next = new Set(attrs)
      if (e.currentTarget.checked) next.add(key)
      else next.delete(key)
      setUrl({ attrs: next.size > 0 ? Array.from(next).join(",") : null })
    },
    [attrs, setUrl],
  )

  const data = useExploreData({
    kind,
    filter,
    sub,
    search,
    // Only pass degree when the active filter actually consumes it,
    // so a stale `?degree=2` on a non-endorsement filter doesn't
    // perturb caching keys / loader behaviour.
    degree: showsDegreeControl ? degree : undefined,
  })

  const onDegreeButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const key = e.currentTarget.dataset.degreeKey
      if (!key) return
      // Default (1st) — drop the param to keep the URL clean. Other
      // values get serialised so `?filter=by-endorsed&degree=2`
      // round-trips through bookmarks.
      setUrl({ degree: key === "1" ? null : key })
    },
    [setUrl],
  )

  // Local search debounce: keep typing snappy, hit indexer once typing stops.
  const [localQuery, setLocalQuery] = useState(search)
  useEffect(() => setLocalQuery(search), [search])
  useEffect(() => {
    const t = setTimeout(() => {
      if (localQuery !== search) setUrl({ q: localQuery || null })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQuery])

  const [sortOpen, setSortOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [subPrefixOpen, setSubPrefixOpen] = useState(false)

  // Register the page title in the top bar's title slot — the chrome
  // already pairs the brandmark with this. Mirrors the convention
  // every other top-level page uses (Apps, Settings, Endorsements…).
  usePageTitle("Explore")

  return (
    <div className="explore">
      <div className="explore__layout">
        <aside className="explore__sidebar" aria-label="Explore filters">
          {/* Kind switcher used to live here but didn't fit in 220px
              with three labels; promoted to the top of the main pane
              (see below). Sidebar is now filter-list-only. */}
          <ul className="explore__filter-list">
            {filtersForKind(kind).map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  className={`explore__filter${filter === f.key ? " explore__filter--active" : ""}`}
                  data-filter-key={f.key}
                  onClick={onFilterButtonClick}
                >
                  {f.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="explore__main">
          {/* Kind switcher (Certs / Projects / Accounts) is now
              rendered as a second row in the top navbar — same
              pattern profile pages use for their tab strip. See
              EXPLORE_TABS in desktop-top-bar.tsx. */}
          <div className="explore__chrome">
            {SUB_OPTIONS[kind].length > 0 ? (
              <SubPrefixDropdown
                kind={kind}
                sub={sub}
                viewerDid={viewerDid}
                onSelect={onSubOptionClick}
                open={subPrefixOpen}
                setOpen={setSubPrefixOpen}
              />
            ) : null}

            <label className="explore__search">
              <Search size={14} strokeWidth={1.75} aria-hidden />
              <input
                type="search"
                placeholder={searchPlaceholder(kind)}
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                className="explore__search-input"
                aria-label={searchPlaceholder(kind)}
              />
            </label>

            <div className="explore__chrome-actions">
              <div
                className="explore__view-toggle"
                role="group"
                aria-label={`${kind === "certs" ? "Cert" : kind === "projects" ? "Project" : "Account"} view`}
              >
                <button
                  type="button"
                  aria-label="List view"
                  aria-pressed={view === "list"}
                  className={`explore__view-btn${view === "list" ? " explore__view-btn--active" : ""}`}
                  onClick={() => setUrl({ view: null })}
                >
                  <ListIcon size={14} strokeWidth={1.75} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Gallery view"
                  aria-pressed={view === "gallery"}
                  className={`explore__view-btn${view === "gallery" ? " explore__view-btn--active" : ""}`}
                  onClick={() => setUrl({ view: "gallery" })}
                >
                  <LayoutGrid size={14} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
              <Popover
                open={sortOpen}
                onClose={() => setSortOpen(false)}
                trigger={
                  <button
                    type="button"
                    className="explore__chrome-btn"
                    onClick={() => setSortOpen((v) => !v)}
                    aria-expanded={sortOpen}
                  >
                    <ArrowUpDown
                      size={13}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    Sort: {SORT_LABEL[sort]}
                  </button>
                }
              >
                {(["newest", "oldest", "alphabetical"] as SortOrder[]).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      className={`popover__item${sort === s ? " popover__item--active" : ""}`}
                      data-sort-key={s}
                      onClick={onSortOptionClick}
                    >
                      {SORT_LABEL[s]}
                    </button>
                  ),
                )}
              </Popover>

              <Popover
                open={filtersOpen}
                onClose={() => setFiltersOpen(false)}
                trigger={
                  <button
                    type="button"
                    className="explore__chrome-btn"
                    onClick={() => setFiltersOpen((v) => !v)}
                    aria-expanded={filtersOpen}
                  >
                    <FilterIcon size={13} strokeWidth={1.75} aria-hidden />
                    Filter{attrs.size ? ` (${attrs.size})` : ""}
                  </button>
                }
              >
                {attrOptions(kind).map((opt) => {
                  const on = attrs.has(opt.key)
                  return (
                    <label
                      key={opt.key}
                      className="popover__item popover__item--check"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        data-attr-key={opt.key}
                        onChange={onAttrToggle}
                      />
                      {opt.label}
                    </label>
                  )
                })}
              </Popover>
            </div>
          </div>

          {showsDegreeControl ? (
            <EndorsementDegreeBar
              degree={degree}
              onSelect={onDegreeButtonClick}
              meta={data.endorsementClosure}
            />
          ) : null}
          <ResultsArea
            kind={kind}
            data={data}
            sort={sort}
            attrs={attrs}
            view={view}
          />
          {data.hasMore || data.isLoadingMore ? (
            <LoadMoreSentinel
              onLoadMore={data.loadMore}
              isLoading={data.isLoadingMore}
            />
          ) : null}
        </main>
      </div>
    </div>
  )
}

/** Pagination sentinel — auto-fires `onLoadMore` when scrolled into
 *  view (IntersectionObserver) and also renders an explicit "Load
 *  more" button so the affordance is keyboard-accessible and
 *  visually anchored at the end of the list. */

// ----------------------- Endorsement-degree selector ------------------------

const DEGREE_HINT: Record<1 | 2 | 3, string> = {
  1: "Accounts you endorse",
  2: "Accounts you endorse, plus everyone they endorse",
  3: "…plus one more hop out",
}

/**
 * Segmented control above the result list when the active filter is
 * endorsement-based (Accounts/"endorsed", Projects|Certs/"by-endorsed").
 *
 * Renders three pills — 1st / 2nd / 3rd — plus a helper caption that
 * updates per selection, and a "showing a subset" notice when the
 * indexer reports `truncated: true`. Caption / truncation messaging
 * matches the issue's product copy verbatim so the UI stays in lockstep
 * with the original spec.
 *
 * Implementation note: data-degree-key on each button + a captured
 * onSelect avoids the same SWC-minifier closure-capture hazard the
 * filter / sub-option buttons solve via `data-filter-key` / `data-sub-key`.
 */
function EndorsementDegreeBar({
  degree,
  onSelect,
  meta,
}: {
  degree: 1 | 2 | 3
  onSelect: (e: React.MouseEvent<HTMLButtonElement>) => void
  meta: ReturnType<typeof useExploreData>["endorsementClosure"]
}) {
  return (
    <div className="explore__degree-bar" role="group" aria-label="Endorsement depth">
      <div className="explore__degree-pills">
        {([1, 2, 3] as const).map((d) => {
          const active = d === degree
          return (
            <button
              key={d}
              type="button"
              data-degree-key={String(d)}
              onClick={onSelect}
              className={`explore__degree-pill${active ? " explore__degree-pill--active" : ""}`}
              aria-pressed={active}
            >
              {d === 1 ? "1st" : d === 2 ? "2nd" : "3rd"}
            </button>
          )
        })}
      </div>
      <p className="explore__degree-caption">{DEGREE_HINT[degree]}</p>
      {meta?.truncated ? (
        <p
          className="explore__degree-truncated"
          role="status"
          aria-live="polite"
        >
          Showing a subset of your trust graph (capped for performance).
        </p>
      ) : null}
      {meta?.warming ? (
        <p
          className="explore__degree-truncated"
          role="status"
          aria-live="polite"
        >
          Building your endorsement graph — results in a moment.
        </p>
      ) : null}
    </div>
  )
}

function LoadMoreSentinel({
  onLoadMore,
  isLoading,
}: {
  onLoadMore: () => void
  isLoading: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  // Capture the latest onLoadMore so the observer doesn't bind a
  // stale closure when the callback identity changes.
  const cbRef = useRef(onLoadMore)
  useEffect(() => {
    cbRef.current = onLoadMore
  }, [onLoadMore])
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) cbRef.current()
        }
      },
      { rootMargin: "200px 0px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className="explore__load-more">
      <button
        type="button"
        className="explore__load-more-btn"
        onClick={onLoadMore}
        disabled={isLoading}
      >
        {isLoading ? "Loading…" : "Load more"}
      </button>
    </div>
  )
}

/** Sub-category dropdown control — sits to the left of the search
 *  input in the chrome row. Single button shows the active option,
 *  click opens a Popover-style menu listing the rest. */
function SubPrefixDropdown({
  kind,
  sub,
  viewerDid,
  onSelect,
  open,
  setOpen,
}: {
  kind: ExploreKind
  sub: string
  viewerDid: string | null
  /** Click handler shared across all option buttons — reads the
   *  selected key from `event.currentTarget.dataset.subKey` rather
   *  than capturing the loop variable in a closure, so the SWC
   *  minifier can't share a single hoisted variable across all
   *  iterations (see comment on `onFilterButtonClick` in the parent
   *  Explore component). */
  onSelect: (e: React.MouseEvent<HTMLButtonElement>) => void
  open: boolean
  setOpen: (next: boolean) => void
}) {
  const options = SUB_OPTIONS[kind]
  if (options.length === 0) return null
  const active = options.find((o) => o.key === sub) ?? options[0]
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      trigger={
        <button
          type="button"
          className="explore__sub-dropdown-trigger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="explore__sub-dropdown-label">{active.label}</span>
          <ChevronDown size={13} strokeWidth={1.75} aria-hidden />
        </button>
      }
    >
      {options.map((opt) => {
        const disabled = opt.requiresAuth && !viewerDid
        return (
          <button
            key={opt.key}
            type="button"
            role="menuitem"
            disabled={disabled}
            title={disabled ? "Sign in to filter by your role" : undefined}
            className={`popover__item${sub === opt.key ? " popover__item--active" : ""}`}
            data-sub-key={opt.key}
            onClick={onSelect}
          >
            {opt.label}
          </button>
        )
      })}
    </Popover>
  )
}

function searchPlaceholder(kind: ExploreKind): string {
  if (kind === "accounts") return "Search accounts by name…"
  if (kind === "projects") return "Search projects…"
  return "Search certs…"
}

function attrOptions(kind: ExploreKind): { key: string; label: string }[] {
  if (kind === "accounts")
    return [
      { key: "has-avatar", label: "Has avatar" },
      { key: "has-description", label: "Has description" },
    ]
  if (kind === "projects")
    return [
      { key: "has-banner", label: "Has banner" },
      { key: "has-items", label: "Has at least one cert" },
    ]
  return [
    { key: "has-image", label: "Has image" },
    { key: "has-shortDescription", label: "Has description" },
  ]
}

function Popover({
  open,
  onClose,
  trigger,
  children,
  align = "right",
}: {
  open: boolean
  onClose: () => void
  trigger: React.ReactNode
  children: React.ReactNode
  /** Which edge of the menu aligns with the trigger.
   *  "right" (default) — menu's right edge under trigger's right (good
   *  for trailing controls like sort/filter).
   *  "left" — menu's left edge under trigger's left (good for leading
   *  controls like the sub-category dropdown at the start of the chrome). */
  align?: "left" | "right"
}) {
  return (
    <div className="popover">
      {trigger}
      {open ? (
        <>
          <div
            className="popover__overlay"
            onClick={onClose}
            aria-hidden
          />
          <div
            className={`popover__menu popover__menu--${align}`}
            role="menu"
          >
            {children}
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Render whatever the data hook returned, applying client-side sort
 *  + attribute filters and routing through the right card. */
function ResultsArea({
  kind,
  data,
  sort,
  attrs,
  view,
}: {
  kind: ExploreKind
  data: ReturnType<typeof useExploreData>
  sort: SortOrder
  attrs: Set<string>
  view: ListGalleryView
}) {
  const closure = data.endorsementClosure

  if (data.isLoading && data.users.length === 0 && data.projects.length === 0 && data.certs.length === 0) {
    return (
      <div className="explore__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }

  if (kind === "accounts") {
    let actors = data.users
    if (attrs.has("has-avatar"))
      actors = actors.filter((a) => !!a.avatarUrl)
    if (attrs.has("has-description"))
      actors = actors.filter((a) => !!a.description)
    actors = sortUsers(actors, sort)
    if (actors.length === 0) return <EmptyResults kind={kind} />
    if (view === "list") {
      return (
        <ul className="explore__list explore__list--accounts">
          {actors.map((a) => (
            <li key={a.did}>
              <AccountListRow
                actor={a}
                endorsementMeta={closure?.closureByDid.get(a.did)}
              />
            </li>
          ))}
        </ul>
      )
    }
    return (
      <ul className="explore__grid explore__grid--users">
        {actors.map((a) => (
          <li key={a.did}>
            <ExploreUserCard actor={a} />
          </li>
        ))}
      </ul>
    )
  }

  if (kind === "projects") {
    let projects = data.projects
    if (attrs.has("has-banner"))
      projects = projects.filter((p) => !!p.value.banner || !!p.value.image)
    if (attrs.has("has-items"))
      projects = projects.filter(
        (p) =>
          Array.isArray(p.value.items) &&
          (p.value.items as unknown[]).length > 0,
      )
    projects = sortProjects(projects, sort)
    if (projects.length === 0) return <EmptyResults kind={kind} />
    if (view === "list") {
      return (
        <ul className="explore__list explore__list--projects">
          {projects.map((p) => {
            const authorDid = projectAuthorDid(p)
            const meta = closure && authorDid
              ? closure.closureByDid.get(authorDid)
              : undefined
            return (
              <li key={p.uri}>
                <ProjectListRow
                  project={p}
                  endorsementMeta={meta}
                />
              </li>
            )
          })}
        </ul>
      )
    }
    return (
      <ul className="explore__grid explore__grid--projects">
        {projects.map((p) => (
          <li key={p.uri}>
            <ExploreProjectCard project={p} />
          </li>
        ))}
      </ul>
    )
  }

  // certs
  let certs = data.certs
  const certDids = data.certDids
  if (attrs.has("has-image"))
    certs = certs.filter((c) => !!c.value.image)
  if (attrs.has("has-shortDescription"))
    certs = certs.filter(
      (c) => typeof c.value.shortDescription === "string" && c.value.shortDescription.length > 0,
    )
  certs = sortCerts(certs, sort)
  if (certs.length === 0) return <EmptyResults kind={kind} />

  if (view === "list") {
    return (
      <ul className="explore__list explore__list--certs">
        {certs.map((rec) => {
          const did = certDids.get(rec.uri) ?? ""
          const meta = closure && did
            ? closure.closureByDid.get(did)
            : undefined
          return (
            <li key={rec.uri}>
              <CertListRow
                record={rec}
                did={did}
                endorsementMeta={meta}
              />
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <ul className="explore__grid explore__grid--certs">
      {certs.map((rec) => {
        const did = certDids.get(rec.uri) ?? ""
        return (
          <li key={rec.uri}>
            <ActivityCard record={rec} did={did} />
          </li>
        )
      })}
    </ul>
  )
}

function EmptyResults({ kind }: { kind: ExploreKind }) {
  const label =
    kind === "accounts" ? "accounts" : kind === "projects" ? "projects" : "certs"
  return (
    <EmptyState
      icon={kind === "accounts" ? Users : kind === "projects" ? FolderGit2 : Award}
      title={`No ${label} match`}
      description="Try a different filter, clear the search, or pick a broader scope."
    />
  )
}

function sortUsers<T extends { displayName: string | null; did: string }>(
  list: T[],
  sort: SortOrder,
): T[] {
  if (sort === "alphabetical") {
    return [...list].sort((a, b) =>
      (a.displayName ?? a.did).localeCompare(b.displayName ?? b.did),
    )
  }
  // newest/oldest don't map cleanly to actors (no createdAt on profile
  // record here); keep insertion order which is roughly recently-indexed.
  if (sort === "oldest") return [...list].reverse()
  return list
}

function sortProjects<
  T extends { value: { createdAt?: string; title?: string } },
>(list: T[], sort: SortOrder): T[] {
  if (sort === "alphabetical") {
    return [...list].sort((a, b) =>
      (a.value.title ?? "").localeCompare(b.value.title ?? ""),
    )
  }
  return [...list].sort((a, b) => {
    const ac = a.value.createdAt ?? ""
    const bc = b.value.createdAt ?? ""
    return sort === "oldest" ? ac.localeCompare(bc) : bc.localeCompare(ac)
  })
}

function sortCerts<
  T extends { value: { createdAt?: string; title?: string } },
>(list: T[], sort: SortOrder): T[] {
  if (sort === "alphabetical") {
    return [...list].sort((a, b) =>
      (a.value.title ?? "").localeCompare(b.value.title ?? ""),
    )
  }
  return [...list].sort((a, b) => {
    const ac = a.value.createdAt ?? ""
    const bc = b.value.createdAt ?? ""
    return sort === "oldest" ? ac.localeCompare(bc) : bc.localeCompare(ac)
  })
}

/**
 * Extract the author DID from an AT-URI of the form
 * `at://<did>/<collection>/<rkey>`. Returns null on a malformed
 * URI so callers can skip the row's endorsement decoration
 * silently rather than crashing the render.
 */
function projectAuthorDid(p: { uri: string }): string | null {
  if (!p.uri.startsWith("at://")) return null
  const tail = p.uri.slice("at://".length)
  const slash = tail.indexOf("/")
  return slash >= 0 ? tail.slice(0, slash) : null
}
