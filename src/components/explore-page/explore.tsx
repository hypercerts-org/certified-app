"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Award,
  Filter as FilterIcon,
  FolderGit2,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import ActivityCard from "@/components/feed/activity-card"
import ExploreUserCard from "./explore-user-card"
import ExploreProjectCard from "./explore-project-card"
import {
  CERT_FILTERS,
  PROJECT_FILTERS,
  SUB_OPTIONS,
  USER_FILTERS,
  defaultFilterForKind,
  filtersForKind,
  parseSubForKind,
  type ExploreKind,
  type SortOrder,
} from "./explore-types"
import { useExploreData } from "@/hooks/use-explore"
import { useAuth } from "@/lib/auth/auth-context"
import { usePageTitle } from "@/lib/navbar-context"

const KIND_TABS: { key: ExploreKind; label: string; icon: typeof Users }[] = [
  { key: "users", label: "Users", icon: Users },
  { key: "projects", label: "Projects", icon: FolderGit2 },
  { key: "certs", label: "Certs", icon: Award },
]

const SORT_LABEL: Record<SortOrder, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  alphabetical: "Alphabetical",
}

function parseKind(v: string | null): ExploreKind {
  if (v === "users" || v === "projects" || v === "certs") return v
  return "users"
}

function parseSort(v: string | null): SortOrder {
  if (v === "newest" || v === "oldest" || v === "alphabetical") return v
  return "newest"
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

  const data = useExploreData({ kind, filter, sub, search })

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

  // Register the page title in the top bar's title slot — the chrome
  // already pairs the brandmark with this. Mirrors the convention
  // every other top-level page uses (Apps, Settings, Endorsements…).
  usePageTitle("Explore")

  return (
    <div className="explore">
      <div className="explore__layout">
        <aside className="explore__sidebar" aria-label="Explore filters">
          <nav className="explore__kind-switch" role="tablist">
            {KIND_TABS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={kind === t.key}
                  className={`explore__kind${kind === t.key ? " explore__kind--active" : ""}`}
                  onClick={() =>
                    setUrl({
                      kind: t.key,
                      filter: null,
                      sub: null,
                      q: null,
                      attrs: null,
                    })
                  }
                >
                  <Icon size={14} strokeWidth={1.75} aria-hidden />
                  {t.label}
                </button>
              )
            })}
          </nav>

          {SUB_OPTIONS[kind].length > 0 ? (
            <nav
              className="explore__kind-switch explore__sub-switch"
              role="tablist"
              aria-label="Sub-category"
            >
              {SUB_OPTIONS[kind].map((opt) => {
                const disabled = opt.requiresAuth && !viewerDid
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="tab"
                    aria-selected={sub === opt.key}
                    disabled={disabled}
                    title={
                      disabled
                        ? "Sign in to filter by your role"
                        : undefined
                    }
                    className={`explore__kind${sub === opt.key ? " explore__kind--active" : ""}`}
                    onClick={() =>
                      setUrl({ sub: opt.key === "all" ? null : opt.key })
                    }
                  >
                    {opt.label}
                  </button>
                )
              })}
            </nav>
          ) : null}
          <ul className="explore__filter-list">
            {filtersForKind(kind).map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  className={`explore__filter${filter === f.key ? " explore__filter--active" : ""}`}
                  onClick={() => setUrl({ filter: f.key })}
                >
                  {f.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="explore__main">
          <div className="explore__chrome">
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
                    <SlidersHorizontal
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
                      onClick={() => {
                        setUrl({ sort: s === "newest" ? null : s })
                        setSortOpen(false)
                      }}
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
                        onChange={() => {
                          const next = new Set(attrs)
                          if (on) next.delete(opt.key)
                          else next.add(opt.key)
                          setUrl({
                            attrs: next.size ? Array.from(next).join(",") : null,
                          })
                        }}
                      />
                      {opt.label}
                    </label>
                  )
                })}
              </Popover>
            </div>
          </div>

          <ResultsArea
            kind={kind}
            data={data}
            sort={sort}
            attrs={attrs}
          />
        </main>
      </div>
    </div>
  )
}

function searchPlaceholder(kind: ExploreKind): string {
  if (kind === "users") return "Search users by name…"
  if (kind === "projects") return "Search projects…"
  return "Search certs…"
}

function attrOptions(kind: ExploreKind): { key: string; label: string }[] {
  if (kind === "users")
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
}: {
  open: boolean
  onClose: () => void
  trigger: React.ReactNode
  children: React.ReactNode
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
          <div className="popover__menu" role="menu">
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
}: {
  kind: ExploreKind
  data: ReturnType<typeof useExploreData>
  sort: SortOrder
  attrs: Set<string>
}) {
  if (data.isLoading && data.users.length === 0 && data.projects.length === 0 && data.certs.length === 0) {
    return (
      <div className="explore__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }

  if (kind === "users") {
    let actors = data.users
    if (attrs.has("has-avatar"))
      actors = actors.filter((a) => !!a.avatarUrl)
    if (attrs.has("has-description"))
      actors = actors.filter((a) => !!a.description)
    actors = sortUsers(actors, sort)
    if (actors.length === 0) return <EmptyResults kind={kind} />
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
    kind === "users" ? "users" : kind === "projects" ? "projects" : "certs"
  return (
    <EmptyState
      icon={kind === "users" ? Users : kind === "projects" ? FolderGit2 : Award}
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
