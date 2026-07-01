"use client"

import { useState } from "react"
import { ChevronDown, Globe } from "lucide-react"
import {
  WORKSPACE_LEXICON_LABEL,
  type WorkspaceLexicon,
} from "@/lib/atproto/workspace"
import { findActor, type WorkspaceLayoutProps } from "../workspace-types"
import WorkspacePane from "../workspace-pane"

/** Layout 4 — Bluesky / Twitter list switcher.
 *
 *  One dropdown switches the active scope. A chip row underneath
 *  filters by lexicon. The structure is hidden behind two pickers
 *  but the feed reads cleanly without any persistent rail. */
export default function BlueskySwitcherLayout({
  actors,
  scope,
  counts,
  lexicon,
  onSetScope,
  onSetLexicon,
}: WorkspaceLayoutProps) {
  const actor = scope.kind === "actor" ? findActor(actors, scope.did) : null
  const [open, setOpen] = useState(false)

  const scopeLabel =
    scope.kind === "network"
      ? "Network"
      : (actor?.displayName ?? scope.did.slice(0, 16))

  return (
    <div className="wks-blue">
      <header className="wks-blue__head">
        <button
          type="button"
          className="wks-blue__switcher"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {scope.kind === "network" ? (
            <Globe size={14} strokeWidth={1.75} aria-hidden />
          ) : actor?.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={actor.avatarUrl} alt="" className="wks-blue__avatar" />
          ) : (
            <span className="wks-blue__avatar wks-blue__avatar--ph" />
          )}
          <span className="wks-blue__switcher-label">{scopeLabel}</span>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
        </button>

        {open ? (
          <ul className="wks-blue__menu" role="menu">
            <li>
              <button
                type="button"
                role="menuitem"
                className="wks-blue__menu-item"
                onClick={() => {
                  onSetScope({ kind: "network" })
                  onSetLexicon(null)
                  setOpen(false)
                }}
              >
                <Globe size={13} strokeWidth={1.75} aria-hidden />
                Network
              </button>
            </li>
            {actors.slice(0, 16).map((a) => (
              <li key={a.did}>
                <button
                  type="button"
                  role="menuitem"
                  className="wks-blue__menu-item"
                  onClick={() => {
                    onSetScope({ kind: "actor", did: a.did })
                    onSetLexicon(null)
                    setOpen(false)
                  }}
                >
                  {a.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={a.avatarUrl}
                      alt=""
                      className="wks-blue__avatar"
                    />
                  ) : (
                    <span className="wks-blue__avatar wks-blue__avatar--ph" />
                  )}
                  {a.displayName ?? a.did.slice(0, 16)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {scope.kind === "actor" ? (
        <div className="wks-blue__chips" role="group" aria-label="Filter by lexicon">
          <button
            type="button"
            className={`ctx-chip${lexicon === null ? " ctx-chip--active" : ""}`}
            onClick={() => onSetLexicon(null)}
          >
            All
          </button>
          {(Object.keys(WORKSPACE_LEXICON_LABEL) as WorkspaceLexicon[]).map(
            (lex) => (
              <button
                key={lex}
                type="button"
                className={`ctx-chip${lexicon === lex ? " ctx-chip--active" : ""}`}
                onClick={() => onSetLexicon(lex)}
              >
                {WORKSPACE_LEXICON_LABEL[lex]} ({counts[lex] ?? "—"})
              </button>
            ),
          )}
        </div>
      ) : null}

      <div className="wks-blue__main">
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
