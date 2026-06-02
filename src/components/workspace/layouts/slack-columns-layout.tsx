"use client"

import { Globe } from "lucide-react"
import {
  WORKSPACE_LEXICON_LABEL,
  type WorkspaceLexicon,
} from "@/lib/atproto/workspace"
import { findActor, type WorkspaceLayoutProps } from "../workspace-types"
import WorkspacePane from "../workspace-pane"

/** Layout 5 — Slack workspace switcher.
 *
 *  Far-left icon column for actor-level switching, middle column
 *  for the active actor's lexicon list, main pane on the right.
 *  Clean separation of "between actors" and "within an actor." */
export default function SlackColumnsLayout({
  actors,
  scope,
  counts,
  lexicon,
  onSetScope,
  onSetLexicon,
}: WorkspaceLayoutProps) {
  const actor = scope.kind === "actor" ? findActor(actors, scope.did) : null

  return (
    <div className="wks-slack">
      <aside className="wks-slack__icons" aria-label="Switch actor">
        <button
          type="button"
          className={`wks-slack__icon${scope.kind === "network" ? " wks-slack__icon--active" : ""}`}
          title="Network"
          onClick={() => {
            onSetScope({ kind: "network" })
            onSetLexicon(null)
          }}
        >
          <Globe size={16} strokeWidth={1.75} aria-hidden />
        </button>
        {actors.slice(0, 16).map((a) => {
          const active = scope.kind === "actor" && scope.did === a.did
          const initial =
            a.displayName?.charAt(0).toUpperCase() ??
            a.did.charAt(8).toUpperCase()
          return (
            <button
              key={a.did}
              type="button"
              className={`wks-slack__icon${active ? " wks-slack__icon--active" : ""}`}
              title={a.displayName ?? a.did}
              onClick={() => {
                onSetScope({ kind: "actor", did: a.did })
                onSetLexicon(null)
              }}
            >
              {a.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={a.avatarUrl} alt="" className="wks-slack__avatar" />
              ) : (
                <span className="wks-slack__initial">{initial}</span>
              )}
            </button>
          )
        })}
      </aside>

      <aside className="wks-slack__lexicons" aria-label="Lexicons">
        <div className="wks-slack__lexicons-head">
          {scope.kind === "network"
            ? "Network"
            : (actor?.displayName ?? "Actor")}
        </div>
        {scope.kind === "actor" ? (
          <ul className="wks-slack__lex-list">
            <li>
              <button
                type="button"
                className={`wks-slack__lex${lexicon === null ? " wks-slack__lex--active" : ""}`}
                onClick={() => onSetLexicon(null)}
              >
                All
              </button>
            </li>
            {(Object.keys(WORKSPACE_LEXICON_LABEL) as WorkspaceLexicon[]).map(
              (lex) => (
                <li key={lex}>
                  <button
                    type="button"
                    className={`wks-slack__lex${lexicon === lex ? " wks-slack__lex--active" : ""}`}
                    onClick={() => onSetLexicon(lex)}
                  >
                    <span className="wks-slack__lex-label">
                      {WORKSPACE_LEXICON_LABEL[lex]}
                    </span>
                    <span className="wks-slack__lex-count">
                      {counts[lex] ?? "—"}
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="wks-slack__lex-empty">
            Pick an actor on the far left.
          </p>
        )}
      </aside>

      <div className="wks-slack__main">
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
