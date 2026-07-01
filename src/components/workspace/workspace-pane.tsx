"use client"

import Link from "next/link"
import { profileUrl } from "@/lib/urls"
import { ArrowRight, Globe } from "lucide-react"
import {
  WORKSPACE_LEXICON_LABEL,
  type WorkspaceCounts,
  type WorkspaceLexicon,
} from "@/lib/atproto/workspace"
import type { WorkspaceScope } from "./workspace-types"
import type { NetworkActor } from "@/lib/atproto/workspace"

interface Props {
  scope: WorkspaceScope
  actor: NetworkActor | null
  counts: WorkspaceCounts
  lexicon: WorkspaceLexicon | null
}

/** The content pane that every layout renders. It doesn't try to
 *  re-implement the existing list views — instead it surfaces the
 *  current state of the workspace navigation and links into the
 *  existing surfaces (profile page, activity feed) where the user
 *  would land. Keeps the layouts comparable on equal footing. */
export default function WorkspacePane({
  scope,
  actor,
  counts,
  lexicon,
}: Props) {
  if (scope.kind === "network") {
    return (
      <div className="wks-pane">
        <header className="wks-pane__head">
          <Globe size={16} strokeWidth={1.75} aria-hidden />
          <h2 className="wks-pane__heading">Network</h2>
        </header>
        <p className="wks-pane__lede">
          Everything on the Certified atproto network. Pick an actor on
          the left to scope.
        </p>
        <Link href="/" className="wks-pane__cta">
          Open the network feed
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    )
  }

  // Actor scope.
  if (!actor) {
    return (
      <div className="wks-pane">
        <p className="wks-pane__lede">Actor not in the recent list.</p>
      </div>
    )
  }

  if (lexicon === null) {
    const lexKeys = Object.keys(WORKSPACE_LEXICON_LABEL) as WorkspaceLexicon[]
    // Counts have all loaded (no nulls) and every one is zero — this actor
    // simply has nothing on the network yet. Surface that explicitly rather
    // than leaving a wall of zeros with no explanation.
    const allLoadedZero = lexKeys.every((lex) => counts[lex] === 0)
    return (
      <div className="wks-pane">
        <header className="wks-pane__head">
          <h2 className="wks-pane__heading">
            {actor.displayName ?? truncateDid(actor.did)}
          </h2>
        </header>
        {actor.description ? (
          <p className="wks-pane__lede">{actor.description}</p>
        ) : null}
        <ul className="wks-pane__grid">
          {lexKeys.map((lex) => (
            <li key={lex} className="wks-pane__grid-item">
              <span className="wks-pane__grid-label">
                {WORKSPACE_LEXICON_LABEL[lex]}
              </span>
              <span className="wks-pane__grid-count">
                {counts[lex] ?? "—"}
              </span>
            </li>
          ))}
        </ul>
        <p className="wks-pane__hint">
          {allLoadedZero
            ? "This actor hasn't published anything on the network yet."
            : "Pick a lexicon on the left to see the list."}
        </p>
        <Link
          href={profileUrl(actor.did)}
          className="wks-pane__cta"
        >
          Open profile
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    )
  }

  const count = counts[lexicon]
  const lexLabel = WORKSPACE_LEXICON_LABEL[lexicon]
  return (
    <div className="wks-pane">
      <header className="wks-pane__head">
        <h2 className="wks-pane__heading">
          {lexLabel} · {actor.displayName ?? truncateDid(actor.did)}
        </h2>
      </header>
      <p className="wks-pane__lede">
        {count !== null
          ? `${count} record${count === 1 ? "" : "s"} authored by this actor.`
          : "Counts haven't loaded yet."}
      </p>
      <Link
        href={hrefForLexicon(actor.did, lexicon)}
        className="wks-pane__cta"
      >
        Open in profile
        <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
      </Link>
    </div>
  )
}

function truncateDid(did: string): string {
  return did.length > 24 ? `${did.slice(0, 16)}…${did.slice(-6)}` : did
}

function hrefForLexicon(did: string, lex: WorkspaceLexicon): string {
  const base = profileUrl(did)
  if (lex === "certs") return `${base}?tab=activities`
  if (lex === "projects") return `${base}?tab=projects`
  if (lex === "lists") return `${base}?tab=lists`
  if (lex === "endorsementsReceived") return `${base}?tab=endorsements`
  if (lex === "followers") return `${base}?tab=followers`
  return base
}
