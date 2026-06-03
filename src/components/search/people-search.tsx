"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon, X } from "lucide-react";
import Avatar from "@/components/ui/avatar";
import Combobox from "@/components/ui/combobox";
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
 * The input + dropdown + keyboard + ARIA machinery is the shared
 * `Combobox` primitive; this surface keeps its own fetch / debounce /
 * navigate-on-select / suppress-next-search behaviour.
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

  const inputRef = useRef<HTMLInputElement>(null);
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
        setIsOpen(true);
      } else {
        setResults([]);
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
      return;
    }
    const seq = ++requestSeq.current;
    debounceRef.current = setTimeout(() => search(query, seq), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

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

  const select = useCallback(
    (actor: Actor) => {
      suppressNextSearchRef.current = true;
      setQuery(actor.displayName || actor.handle);
      setResults([]);
      setIsOpen(false);
      setIsSearching(false);
      inputRef.current?.blur();
      router.push(`/profile/${encodeURIComponent(actor.did)}`);
    },
    [router]
  );

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <Combobox<Actor>
      className={`people-search ${className}`}
      role="search"
      value={query}
      onValueChange={setQuery}
      items={results}
      getItemKey={(actor) => actor.did}
      isLoading={isSearching}
      open={isOpen}
      onOpenChange={setIsOpen}
      onSelect={select}
      inputRef={inputRef}
      listboxClassName="people-search__dropdown"
      liveStatus={{
        searching: "Searching",
        results: (n) => `${n} result${n === 1 ? "" : "s"}`,
        empty: "No people found",
      }}
      inputProps={{
        size: "md",
        placeholder,
        autoFocus,
        "aria-label": "Search people on atproto",
        leadingIcon: <SearchIcon size={16} aria-hidden="true" />,
      }}
      trailingButton={
        query ? (
          <button
            type="button"
            className="people-search__clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : undefined
      }
      renderEmpty={() => {
        if (isSearching) {
          return <li className="people-search__empty">Searching…</li>;
        }
        if (query.trim()) {
          return (
            <li className="people-search__empty">
              No people found for &ldquo;{query.trim()}&rdquo;.
            </li>
          );
        }
        return null;
      }}
      renderOption={({ item: actor, highlighted, optionId, onHover, onSelect }) => {
        const name = actor.displayName || actor.handle;
        return (
          <li
            id={optionId}
            role="option"
            aria-selected={highlighted}
            data-combobox-option
            className={`people-search__item ${
              highlighted ? "people-search__item--highlighted" : ""
            }`}
            onMouseEnter={onHover}
            onMouseDown={onSelect}
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
      }}
    />
  );
}
