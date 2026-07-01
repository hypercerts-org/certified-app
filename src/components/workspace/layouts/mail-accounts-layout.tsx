"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Globe } from "lucide-react"
import {
  WORKSPACE_LEXICON_LABEL,
  type WorkspaceLexicon,
} from "@/lib/atproto/workspace"
import { findActor, type WorkspaceLayoutProps } from "../workspace-types"
import WorkspacePane from "../workspace-pane"

/** Layout 3 — Apple Mail "accounts" tree.
 *
 *  Each actor is a top-level account in the sidebar; its lexicons
 *  nest inline. Expanding an actor reveals their lexicon tree.
 *  Switching accounts re-roots the visible subtree. */
export default function MailAccountsLayout({
  actors,
  scope,
  counts,
  lexicon,
  onSetScope,
  onSetLexicon,
}: WorkspaceLayoutProps) {
  const actor = scope.kind === "actor" ? findActor(actors, scope.did) : null
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand the active account on first render.
    return scope.kind === "actor" ? new Set([scope.did]) : new Set()
  })

  function toggle(did: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(did)) next.delete(did)
      else next.add(did)
      return next
    })
  }

  return (
    <div className="wks-mail">
      <aside className="wks-mail__rail" aria-label="Accounts">
        <button
          type="button"
          className={`wks-mail__network${scope.kind === "network" ? " wks-mail__network--active" : ""}`}
          onClick={() => {
            onSetScope({ kind: "network" })
            onSetLexicon(null)
          }}
        >
          <Globe size={13} strokeWidth={1.75} aria-hidden />
          Network
        </button>

        <ul className="wks-mail__accounts">
          {actors.slice(0, 12).map((a) => {
            const open = expanded.has(a.did)
            const accountActive =
              scope.kind === "actor" && scope.did === a.did
            return (
              <li key={a.did} className="wks-mail__account">
                <button
                  type="button"
                  className={`wks-mail__account-head${accountActive ? " wks-mail__account-head--active" : ""}`}
                  onClick={() => {
                    if (!accountActive) {
                      onSetScope({ kind: "actor", did: a.did })
                      onSetLexicon(null)
                    }
                    toggle(a.did)
                  }}
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
                  ) : (
                    <ChevronRight size={12} strokeWidth={1.75} aria-hidden />
                  )}
                  {a.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={a.avatarUrl} alt="" className="wks-mail__avatar" />
                  ) : (
                    <span className="wks-mail__avatar wks-mail__avatar--ph" />
                  )}
                  <span className="wks-mail__account-label">
                    {a.displayName ?? a.did.slice(0, 16)}
                  </span>
                </button>
                {open ? (
                  <ul className="wks-mail__folders">
                    {(
                      Object.keys(WORKSPACE_LEXICON_LABEL) as WorkspaceLexicon[]
                    ).map((lex) => {
                      const lexActive =
                        accountActive && lexicon === lex
                      return (
                        <li key={lex}>
                          <button
                            type="button"
                            className={`wks-mail__folder${lexActive ? " wks-mail__folder--active" : ""}`}
                            onClick={() => {
                              if (!accountActive) {
                                onSetScope({ kind: "actor", did: a.did })
                              }
                              onSetLexicon(lex)
                            }}
                          >
                            <span className="wks-mail__folder-label">
                              {WORKSPACE_LEXICON_LABEL[lex]}
                            </span>
                            {accountActive ? (
                              <span className="wks-mail__folder-count">
                                {counts[lex] ?? "—"}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      </aside>

      <div className="wks-mail__main">
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
