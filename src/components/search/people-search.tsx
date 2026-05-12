"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon, X } from "lucide-react";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";

interface Actor {
  did: string;
  handle: string;
  displayName: string;
  avatar: string | null;
}

interface PeopleSearchProps {
  /** Optional className passed to the wrapping element. */
  readonly className?: string;
  /** Override placeholder text. */
  readonly placeholder?: string;
  /** Initial query value (e.g. read from URL on the Explore page). */
  readonly initialQuery?: string;
  /** Auto-focus the input on mount (used on the dedicated Explore page). */
  readonly autoFocus?: boolean;
}

const SEARCH_DEBOUNCE_MS = 250;

/**
 * `true` if the target element is an editable input that the user is
 * actively typing into. Used by the global Cmd/Ctrl+K shortcut to avoid
 * yanking focus while someone is composing elsewhere on the page.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return false;
}

/**
 * People search typeahead.
 *
 * Behaviour:
 * - Calls /api/search-actors (debounced, 250ms) for matching atproto identities.
 * - Up/Down arrows move the highlight (with wrap-around). Home/End jump.
 * - Enter selects the highlighted result; if nothing is highlighted, falls back
 *   to the first result.
 * - Esc closes the dropdown on first press; if already closed, clears the
 *   input (matches WAI-ARIA combobox pattern).
 * - Cmd/Ctrl+K focuses the input — but only when the user isn't typing in
 *   another editable element.
 * - Selecting a result navigates to /profile/<did>.
 *
 * Live-region announcements (a11y): a visually-hidden polite region
 * announces "Searching…" / "N results" / "No results" so screen readers
 * are notified when the dropdown state changes.
 *
 * Mirrors hypercerts-org/certified-app#51.
 */
export default function PeopleSearch({
  className = "",
  placeholder = "Search people on atproto",
  initialQuery = "",
  autoFocus = false,
}: PeopleSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Actor[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Drop stale responses when the user keeps typing.
  const requestSeq = useRef(0);
  // Set when we update `query` programmatically after a selection so the
  // debounced search effect skips the auto-fire for that one update.
  const suppressNextSearchRef = useRef(false);

  // Debounced fetch. Uses plain fetch (not authFetch) — the route is
  // unauthenticated, and we don't want a transient 5xx to trip the global
  // 401 -> sign-in interceptor.
  const search = useCallback(async (q: string, seq: number) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setIsOpen(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/search-actors?q=${encodeURIComponent(trimmed)}&limit=8`,
        { headers: { Accept: "application/json" } }
      );
      if (seq !== requestSeq.current) return;
      if (res.ok) {
        const data = (await res.json()) as { actors?: Actor[] };
        const next = data.actors ?? [];
        setResults(next);
        setHighlight(next.length > 0 ? 0 : -1);
        setIsOpen(true);
      } else {
        setResults([]);
        setHighlight(-1);
        setIsOpen(true);
      }
    } catch (err) {
      // Keep previous results visible to avoid flicker. Log in dev so a
      // genuine endpoint outage doesn't silently look like "search stopped
      // working".
      if (process.env.NODE_ENV !== "production") {
        console.warn("[people-search] fetch failed:", err);
      }
    } finally {
      if (seq === requestSeq.current) setIsSearching(false);
    }
  }, []);

  // Run the debounced search whenever `query` changes.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      setIsSearching(false);
      setHighlight(-1);
      return;
    }
    const seq = ++requestSeq.current;
    debounceRef.current = setTimeout(() => search(query, seq), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Cmd/Ctrl+K focus shortcut. Only fires when the user isn't already
  // typing in another editable element — yanking focus from a post
  // composer mid-sentence is a non-starter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      if (isEditableTarget(e.target) && e.target !== inputRef.current) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);

  // Keep the highlighted row visible when navigating with the keyboard.
  useEffect(() => {
    if (highlight < 0 || !listRef.current) return;
    const el = listRef.current.querySelectorAll<HTMLLIElement>("[data-result-row]")[highlight];
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const select = useCallback(
    (actor: Actor) => {
      suppressNextSearchRef.current = true;
      setQuery(actor.displayName || actor.handle);
      setResults([]);
      setIsOpen(false);
      setIsSearching(false);
      setHighlight(-1);
      inputRef.current?.blur();
      router.push(`/profile/${encodeURIComponent(actor.did)}`);
    },
    [router]
  );

  // Per-key handlers — keeps handleKeyDown trivially below Sonar's
  // cognitive-complexity ceiling and easier to scan.
  const moveHighlight = useCallback((delta: 1 | -1) => {
    setIsOpen(true);
    setHighlight((h) => {
      if (results.length === 0) return -1;
      if (delta === 1) return (h + 1) % results.length;
      return h <= 0 ? results.length - 1 : h - 1;
    });
  }, [results.length]);

  const onEnter = useCallback(() => {
    if (results.length === 0) return;
    const target = highlight >= 0 ? results[highlight] : results[0];
    if (target) select(target);
  }, [results, highlight, select]);

  // Esc: WAI-ARIA combobox pattern. First press closes the listbox; if it's
  // already closed (or the input is empty), clear the input.
  const onEscape = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    if (query) setQuery("");
    else inputRef.current?.blur();
  }, [isOpen, query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        if (results.length === 0) return;
        e.preventDefault();
        moveHighlight(1);
        return;
      case "ArrowUp":
        if (results.length === 0) return;
        e.preventDefault();
        moveHighlight(-1);
        return;
      case "Enter":
        if (results.length === 0) return;
        e.preventDefault();
        onEnter();
        return;
      case "Escape":
        e.preventDefault();
        onEscape();
        return;
      case "Home":
        if (results.length === 0) return;
        e.preventDefault();
        setHighlight(0);
        return;
      case "End":
        if (results.length === 0) return;
        e.preventDefault();
        setHighlight(results.length - 1);
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setHighlight(-1);
    inputRef.current?.focus();
  };

  const showDropdown =
    isOpen && (isSearching || results.length > 0 || query.trim().length > 0);

  const listboxId = "people-search-listbox";
  const activeId = highlight >= 0 ? `people-search-option-${highlight}` : undefined;

  // Live-region message. Empty string when nothing to announce so
  // screen readers don't say "blank".
  let liveStatus = "";
  if (isSearching) liveStatus = "Searching";
  else if (results.length > 0) liveStatus = `${results.length} result${results.length === 1 ? "" : "s"}`;
  else if (query.trim()) liveStatus = "No people found";

  return (
    <div
      ref={containerRef}
      className={`people-search ${className}`}
      role="search"
    >
      <div className="people-search__field">
        <SearchIcon size={16} className="people-search__icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          className="people-search__input"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          role="combobox"
          aria-label="Search people on atproto"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={activeId}
          autoComplete="off"
          autoFocus={autoFocus}
          spellCheck={false}
        />
        {query ? (
          <button
            type="button"
            className="people-search__clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* Visually-hidden live region — announces search state to SR users.
          Polite so it doesn't interrupt mid-utterance. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>

      {showDropdown && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-busy={isSearching}
          className="people-search__dropdown"
        >
          {isSearching && results.length === 0 && (
            <li className="people-search__empty">
              Searching…
            </li>
          )}
          {!isSearching && results.length === 0 && query.trim() && (
            <li className="people-search__empty">
              No people found for &ldquo;{query.trim()}&rdquo;.
            </li>
          )}
          {results.map((actor, i) => {
            const name = actor.displayName || actor.handle;
            const isHighlighted = i === highlight;
            return (
              <li
                key={actor.did}
                id={`people-search-option-${i}`}
                role="option"
                aria-selected={isHighlighted}
                data-result-row
                className={`people-search__item ${
                  isHighlighted ? "people-search__item--highlighted" : ""
                }`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  // mouseDown (not click) — fires before the input's blur so
                  // the dropdown doesn't disappear before navigation.
                  e.preventDefault();
                  select(actor);
                }}
              >
                <Avatar
                  size="sm"
                  src={actor.avatar || undefined}
                  fallbackInitials={getInitials(name, actor.did)}
                />
                <div className="people-search__item-info">
                  <span className="people-search__item-name">{name}</span>
                  <span className="people-search__item-handle">@{actor.handle}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
