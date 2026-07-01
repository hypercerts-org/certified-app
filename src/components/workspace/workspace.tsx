"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs"
import {
  useActorWorkspaceCounts,
  useNetworkActors,
} from "@/hooks/use-workspace"
import type { WorkspaceLexicon } from "@/lib/atproto/workspace"
import BreadcrumbLayout from "./layouts/breadcrumb-layout"
import NotionRailLayout from "./layouts/notion-rail-layout"
import MailAccountsLayout from "./layouts/mail-accounts-layout"
import BlueskySwitcherLayout from "./layouts/bluesky-switcher-layout"
import SlackColumnsLayout from "./layouts/slack-columns-layout"
import type { WorkspaceScope } from "./workspace-types"

const LAYOUTS = [
  { key: "notion", label: "Notion left rail" },
  { key: "breadcrumb", label: "GitHub breadcrumb" },
  { key: "mail", label: "Mail accounts" },
  { key: "bluesky", label: "Bluesky switcher" },
  { key: "slack", label: "Slack columns" },
] as const

type LayoutKey = (typeof LAYOUTS)[number]["key"]

const LEXICON_KEYS = new Set<WorkspaceLexicon>([
  "certs",
  "projects",
  "lists",
  "endorsementsReceived",
  "followers",
])

function parseScope(actorParam: string | null): WorkspaceScope {
  if (actorParam && actorParam.startsWith("did:"))
    return { kind: "actor", did: actorParam }
  return { kind: "network" }
}

function parseLexicon(lexParam: string | null): WorkspaceLexicon | null {
  if (lexParam && LEXICON_KEYS.has(lexParam as WorkspaceLexicon)) {
    return lexParam as WorkspaceLexicon
  }
  return null
}

function parseLayout(layoutParam: string | null): LayoutKey {
  if (layoutParam && LAYOUTS.some((l) => l.key === layoutParam))
    return layoutParam as LayoutKey
  return "notion"
}

/**
 * Top-level Workspace explorer.
 *
 * URL is the source of truth — `?layout=…&actor=did:…&lexicon=…` —
 * so deep-linking and Back-button navigation work cleanly. Five
 * layout candidates render the same `(scope, lexicon)` state to
 * compare navigation patterns. The shared <WorkspacePane> in the
 * content slot keeps each layout on equal footing.
 */
export default function Workspace() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const { actors, isLoading: actorsLoading } = useNetworkActors()

  // Hydrate state from URL on first render and on history nav.
  const layout: LayoutKey = parseLayout(searchParams?.get("layout") ?? null)
  const scope: WorkspaceScope = parseScope(searchParams?.get("actor") ?? null)
  const lexicon: WorkspaceLexicon | null = parseLexicon(
    searchParams?.get("lexicon") ?? null,
  )

  // Counts are scoped to the active actor only.
  const { counts, isLoading: countsLoading } = useActorWorkspaceCounts(
    scope.kind === "actor" ? scope.did : null,
  )

  // Help with first-time-empty: if there's no `actor` param yet but
  // we have actors loaded, pick the first one as a default scope so
  // the comparison surfaces start populated.
  const [defaulted, setDefaulted] = useState(false)
  useEffect(() => {
    if (defaulted) return
    if (scope.kind !== "network") return
    if (!actors.length) return
    setDefaulted(true)
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.set("actor", actors[0].did)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [actors, defaulted, scope.kind, searchParams, pathname, router])

  const setUrl = useCallback(
    (next: Partial<{ layout: LayoutKey; actor: string | null; lexicon: WorkspaceLexicon | null }>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (next.layout !== undefined) params.set("layout", next.layout)
      if (next.actor !== undefined) {
        if (next.actor === null) params.delete("actor")
        else params.set("actor", next.actor)
      }
      if (next.lexicon !== undefined) {
        if (next.lexicon === null) params.delete("lexicon")
        else params.set("lexicon", next.lexicon)
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [searchParams, pathname, router],
  )

  const onSetScope = useCallback(
    (s: WorkspaceScope) =>
      setUrl({ actor: s.kind === "network" ? null : s.did, lexicon: null }),
    [setUrl],
  )
  const onSetLexicon = useCallback(
    (l: WorkspaceLexicon | null) => setUrl({ lexicon: l }),
    [setUrl],
  )

  const layoutProps = {
    actors,
    actorsLoading,
    scope,
    counts,
    countsLoading,
    lexicon,
    onSetScope,
    onSetLexicon,
  }

  return (
    <div className="workspace">
      <header className="workspace__head">
        <span className="workspace__eyebrow">Workspace</span>
        <h1 className="workspace__title">Navigation patterns</h1>
        <p className="workspace__subtitle">
          Five candidate structures for stepping between the network,
          actors, and per-lexicon listings. Pick a layout below and
          compare.
        </p>
      </header>

      <Tabs
        value={layout}
        onChange={(next) => setUrl({ layout: next as LayoutKey })}
      >
        <TabList
          aria-label="Layout candidates"
          className="flex-wrap mb-5"
        >
          {LAYOUTS.map((l) => (
            <Tab key={l.key} value={l.key}>
              {l.label}
            </Tab>
          ))}
        </TabList>

        <TabPanel value={layout} className="workspace__body">
          {actorsLoading && actors.length === 0 ? (
            <div className="workspace__loading">
              <LoadingSpinner size="md" />
            </div>
          ) : layout === "notion" ? (
            <NotionRailLayout {...layoutProps} />
          ) : layout === "breadcrumb" ? (
            <BreadcrumbLayout {...layoutProps} />
          ) : layout === "mail" ? (
            <MailAccountsLayout {...layoutProps} />
          ) : layout === "bluesky" ? (
            <BlueskySwitcherLayout {...layoutProps} />
          ) : (
            <SlackColumnsLayout {...layoutProps} />
          )}
        </TabPanel>
      </Tabs>
    </div>
  )
}
