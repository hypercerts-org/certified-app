"use client"

import { ChevronRight, Globe } from "lucide-react"
import { useState } from "react"
import {
  WORKSPACE_LEXICON_LABEL,
  type WorkspaceLexicon,
} from "@/lib/atproto/workspace"
import { findActor, type WorkspaceLayoutProps } from "../workspace-types"
import WorkspacePane from "../workspace-pane"

/** Layout 1 — GitHub-style breadcrumb hierarchy.
 *
 *  Top breadcrumb (Workspace › actor › lexicon) doubles as the
 *  navigation. Each segment is a clickable dropdown that lets the
 *  user pivot. URL is the source of truth; deep-linking is trivial. */
export default function BreadcrumbLayout({
  actors,
  scope,
  counts,
  lexicon,
  onSetScope,
  onSetLexicon,
}: WorkspaceLayoutProps) {
  const actor = scope.kind === "actor" ? findActor(actors, scope.did) : null
  const [openLevel, setOpenLevel] = useState<"scope" | "lexicon" | null>(null)

  return (
    <div className="wks-breadcrumb">
      <nav
        className="wks-breadcrumb__bar"
        aria-label="Workspace hierarchy"
      >
        <button
          type="button"
          className="wks-breadcrumb__crumb"
          onClick={() =>
            setOpenLevel(openLevel === "scope" ? null : "scope")
          }
        >
          {scope.kind === "network" ? (
            <>
              <Globe size={13} strokeWidth={1.75} aria-hidden />
              Network
            </>
          ) : (
            actor?.displayName ?? scope.did.slice(0, 16)
          )}
          <ChevronRight size={12} strokeWidth={1.75} aria-hidden />
        </button>

        {scope.kind === "actor" ? (
          <button
            type="button"
            className="wks-breadcrumb__crumb"
            onClick={() =>
              setOpenLevel(openLevel === "lexicon" ? null : "lexicon")
            }
          >
            {lexicon ? WORKSPACE_LEXICON_LABEL[lexicon] : "All"}
            <ChevronRight size={12} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </nav>

      {openLevel === "scope" ? (
        <ul className="wks-breadcrumb__menu" role="menu">
          <li>
            <button
              type="button"
              role="menuitem"
              className="wks-breadcrumb__menu-item"
              onClick={() => {
                onSetScope({ kind: "network" })
                onSetLexicon(null)
                setOpenLevel(null)
              }}
            >
              <Globe size={13} strokeWidth={1.75} aria-hidden />
              Network
            </button>
          </li>
          {actors.map((a) => (
            <li key={a.did}>
              <button
                type="button"
                role="menuitem"
                className="wks-breadcrumb__menu-item"
                onClick={() => {
                  onSetScope({ kind: "actor", did: a.did })
                  onSetLexicon(null)
                  setOpenLevel(null)
                }}
              >
                {a.displayName ?? a.did.slice(0, 16)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {openLevel === "lexicon" && scope.kind === "actor" ? (
        <ul className="wks-breadcrumb__menu" role="menu">
          <li>
            <button
              type="button"
              className="wks-breadcrumb__menu-item"
              onClick={() => {
                onSetLexicon(null)
                setOpenLevel(null)
              }}
            >
              All ({sumCounts(counts)})
            </button>
          </li>
          {(Object.keys(WORKSPACE_LEXICON_LABEL) as WorkspaceLexicon[]).map(
            (lex) => (
              <li key={lex}>
                <button
                  type="button"
                  className="wks-breadcrumb__menu-item"
                  onClick={() => {
                    onSetLexicon(lex)
                    setOpenLevel(null)
                  }}
                >
                  {WORKSPACE_LEXICON_LABEL[lex]} ({counts[lex] ?? "—"})
                </button>
              </li>
            ),
          )}
        </ul>
      ) : null}

      <div className="wks-breadcrumb__main">
        <WorkspacePane
          scope={scope}
          actor={actor}
          counts={counts}
          lexicon={lexicon}
        />
      </div>
    </div>
  )
}

function sumCounts(c: Record<string, number | null>): number {
  return Object.values(c).reduce<number>(
    (s, v) => s + (typeof v === "number" ? v : 0),
    0,
  )
}
