"use client"

import { useEffect, useRef, useState } from "react"
import { TextSearch } from "lucide-react"
import Input from "@/components/ui/input"

/**
 * The explore search input, debounced against the URL's `?q=` param.
 * Owns the per-keystroke local state so typing re-renders only this
 * component — the parent (ExploreMain / ExploreAllBlocks, which
 * renders the whole chrome + results tree) re-renders once per
 * committed URL change, not per keystroke.
 */
export default function ExploreSearchField({
  search,
  placeholder,
  onCommit,
}: {
  /** The committed value from the URL (`?q=`). External changes —
   *  back/forward, a filter switch that clears `q` — sync into the
   *  input; our own debounced writes are recognised and skipped. */
  search: string
  placeholder: string
  /** Commits the debounced query to the URL — receives the trimmed
   *  patch value (`null` clears the param). */
  onCommit: (q: string | null) => void
}) {
  // Local search debounce: keep typing snappy, hit indexer once typing stops.
  const [localQuery, setLocalQuery] = useState(search)
  // Remember the value we last wrote to the URL so the URL→local
  // sync below can tell our own debounce writes apart from external
  // URL changes (back/forward, filter switch that clears `q`). Without
  // this, the sync effect fires every time we write — and if the user
  // typed an extra keystroke between scheduling the write and the URL
  // commit, that keystroke gets stomped (it shows on screen briefly,
  // then the URL→local sync overwrites localQuery with the older URL
  // value). Symptom: "not all keystrokes are recognised when results
  // come in."
  const lastWroteToUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (search === lastWroteToUrlRef.current) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional external-sync escape hatch: back/forward or a filter switch rewrites `?q=` and must overwrite the local draft; a render-time adjustment would need to read lastWroteToUrlRef during render (react-hooks/refs)
    setLocalQuery(search)
  }, [search])
  // Latest-prop mirrors for the debounce timer. The timeout callback
  // must read the CURRENT `search` / `onCommit`, not the ones captured
  // at the last keystroke's render: the parents' onCommit closes over a
  // URLSearchParams snapshot, so a stale one would rebuild the URL from
  // a pre-click state and silently revert a sort / filter / view change
  // made during the 350ms window. Updated in an effect (never during
  // render — react-hooks/refs).
  const searchRef = useRef(search)
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    searchRef.current = search
    onCommitRef.current = onCommit
  }, [search, onCommit])
  useEffect(() => {
    // Debounce restarts on keystrokes only — the timer reads `search` /
    // `onCommit` through the refs above, so it always sees the latest
    // values without restarting per URL change.
    const t = setTimeout(() => {
      if (localQuery !== searchRef.current) {
        lastWroteToUrlRef.current = localQuery
        onCommitRef.current(localQuery || null)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [localQuery])

  return (
    <div className="explore__search-field">
      <Input
        type="search"
        size="sm"
        leadingIcon={<TextSearch size={14} strokeWidth={1.75} aria-hidden />}
        placeholder={placeholder}
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
        aria-label={placeholder}
      />
    </div>
  )
}
