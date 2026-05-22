"use client"

import { Globe } from "lucide-react"
import {
  WORKSPACE_LEXICON_LABEL,
  type WorkspaceLexicon,
} from "@/lib/atproto/workspace"
import { findActor, type WorkspaceLayoutProps } from "../workspace-types"
import WorkspacePane from "../workspace-pane"

/** Layout 2 — Notion left rail workspace.
 *
 *  Persistent left sidebar shows the actor switcher at the top and
 *  the active actor's lexicon tree below. One click pivots scope;
 *  another click drills into a lexicon. Structure is always
 *  visible. */
export default function NotionRailLayout({
  actors,
  scope,
  counts,
  lexicon,
  onSetScope,
  onSetLexicon,
}: WorkspaceLayoutProps) {
  const actor = scope.kind === "actor" ? findActor(actors, scope.did) : null

  return (
    <div className="wks-notion">
      <aside className="wks-notion__rail" aria-label="Workspace navigation">
        <div className="wks-notion__section">
          <div className="wks-notion__section-label">Scope</div>
          <button
            type="button"
            className={`wks-notion__node${scope.kind === "network" ? " wks-notion__node--active" : ""}`}
            onClick={() => {
              onSetScope({ kind: "network" })
              onSetLexicon(null)
            }}
          >
            <Globe size={13} strokeWidth={1.75} aria-hidden />
            Network
          </button>
        </div>

        <div className="wks-notion__section">
          <div className="wks-notion__section-label">Recent actors</div>
          <ul className="wks-notion__list">
            {actors.slice(0, 12).map((a) => {
              const active =
                scope.kind === "actor" && scope.did === a.did
              return (
                <li key={a.did}>
                  <button
                    type="button"
                    className={`wks-notion__node${active ? " wks-notion__node--active" : ""}`}
                    onClick={() => {
                      onSetScope({ kind: "actor", did: a.did })
                      onSetLexicon(null)
                    }}
                  >
                    {a.avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={a.avatarUrl}
                        alt=""
                        className="wks-notion__avatar"
                      />
                    ) : (
                      <span className="wks-notion__avatar wks-notion__avatar--ph" />
                    )}
                    <span className="wks-notion__node-label">
                      {a.displayName ?? a.did.slice(0, 16)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {scope.kind === "actor" ? (
          <div className="wks-notion__section">
            <div className="wks-notion__section-label">
              {actor?.displayName ?? "Actor"}
            </div>
            <ul className="wks-notion__list">
              <li>
                <button
                  type="button"
                  className={`wks-notion__node${lexicon === null ? " wks-notion__node--active" : ""}`}
                  onClick={() => onSetLexicon(null)}
                >
                  All
                </button>
              </li>
              {(
                Object.keys(WORKSPACE_LEXICON_LABEL) as WorkspaceLexicon[]
              ).map((lex) => (
                <li key={lex}>
                  <button
                    type="button"
                    className={`wks-notion__node${lexicon === lex ? " wks-notion__node--active" : ""}`}
                    onClick={() => onSetLexicon(lex)}
                  >
                    <span className="wks-notion__node-label">
                      {WORKSPACE_LEXICON_LABEL[lex]}
                    </span>
                    <span className="wks-notion__node-count">
                      {counts[lex] ?? "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      <div className="wks-notion__main">
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
