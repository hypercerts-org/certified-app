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
    setLocalQuery(search)
  }, [search])
  useEffect(() => {
    const t = setTimeout(() => {
      if (localQuery !== search) {
        lastWroteToUrlRef.current = localQuery
        onCommit(localQuery || null)
      }
    }, 350)
    return () => clearTimeout(t)
    // Debounce fires on keystrokes only — `search` / `onCommit` are
    // read fresh but must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
