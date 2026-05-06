"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";

interface Actor {
  did: string;
  handle: string;
  displayName: string;
  avatar: string | null;
}

interface NavbarSearchProps {
  /** Optional className passed to the wrapping element. */
  className?: string;
  /** Override placeholder text. */
  placeholder?: string;
}

/**
 * Top-of-page user search.
 *
 * Behaviour:
 * - Calls /api/search-actors (debounced, 250ms) to suggest matching atproto identities.
 * - Up/Down arrows move the highlight through the dropdown (with wrap-around).
 * - Enter selects the highlighted result; if nothing is highlighted, falls back to
 *   the first result. Esc clears + closes the dropdown.
 * - Cmd/Ctrl+K from anywhere on the page focuses the search input.
 * - Selecting a result navigates to /profile/<did>.
 */
export default function NavbarSearch({
  className = "",
  placeholder = "Search people on atproto",
}: NavbarSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Actor[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lets us drop stale responses when the user keeps typing.
  const requestSeq = useRef(0);

  // Debounced fetch.
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
      // Plain fetch (not authFetch) — the route is unauthenticated, and we don't
      // want a transient 5xx to trip the global 401 → sign-in interceptor.
      const res = await fetch(
        `/api/search-actors?q=${encodeURIComponent(trimmed)}&limit=8`,
        { headers: { Accept: "application/json" } }
      );
      // If a newer request started while this one was in flight, drop the result.
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
    } catch {
      // ignore — keep the previous results visible to avoid flicker
    } finally {
      if (seq === requestSeq.current) setIsSearching(false);
    }
  }, []);

  // Run the debounced search whenever `query` changes.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      setIsSearching(false);
      setHighlight(-1);
      return;
    }
    const seq = ++requestSeq.current;
    debounceRef.current = setTimeout(() => search(query, seq), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Cmd/Ctrl+K focus shortcut, scoped to keyboard events outside other inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the highlighted row visible when navigating with the keyboard.
  useEffect(() => {
    if (highlight < 0 || !listRef.current) return;
    const el = listRef.current.querySelectorAll<HTMLLIElement>("[data-result-row]")[highlight];
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const select = useCallback(
    (actor: Actor) => {
      setQuery("");
      setResults([]);
      setIsOpen(false);
      setHighlight(-1);
      // Blur so the dropdown doesn't reappear on the destination page.
      inputRef.current?.blur();
      router.push(`/profile/${encodeURIComponent(actor.did)}`);
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Open the dropdown on first arrow-down even before any results have loaded.
    if (e.key === "ArrowDown") {
      if (results.length === 0) return;
      e.preventDefault();
      setIsOpen(true);
      setHighlight((h) => (h + 1) % results.length);
      return;
    }
    if (e.key === "ArrowUp") {
      if (results.length === 0) return;
      e.preventDefault();
      setIsOpen(true);
      setHighlight((h) => (h <= 0 ? results.length - 1 : h - 1));
      return;
    }
    if (e.key === "Enter") {
      if (results.length === 0) return;
      e.preventDefault();
      const target = highlight >= 0 ? results[highlight] : results[0];
      if (target) select(target);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (query) {
        setQuery("");
      } else {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    if (e.key === "Home") {
      if (results.length === 0) return;
      e.preventDefault();
      setHighlight(0);
      return;
    }
    if (e.key === "End") {
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

  // ARIA: tie input to listbox + active row for screen readers.
  const listboxId = "navbar-search-listbox";
  const activeId = highlight >= 0 ? `navbar-search-option-${highlight}` : undefined;

  return (
    <div
      ref={containerRef}
      className={`navbar-search ${className}`}
      role="search"
    >
      <div className="navbar-search__field">
        <Search size={16} className="navbar-search__icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          className="navbar-search__input"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 || query.trim().length > 0) setIsOpen(true);
          }}
          role="combobox"
          aria-label="Search people on atproto"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
        />
        {query ? (
          <button
            type="button"
            className="navbar-search__clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {showDropdown && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="navbar-search__dropdown"
        >
          {isSearching && results.length === 0 && (
            <li className="navbar-search__empty" role="presentation">
              Searching…
            </li>
          )}
          {!isSearching && results.length === 0 && query.trim() && (
            <li className="navbar-search__empty" role="presentation">
              No people found for &ldquo;{query.trim()}&rdquo;.
            </li>
          )}
          {results.map((actor, i) => {
            const name = actor.displayName || actor.handle;
            const isHighlighted = i === highlight;
            return (
              <li
                key={actor.did}
                id={`navbar-search-option-${i}`}
                role="option"
                aria-selected={isHighlighted}
                data-result-row
                className={`navbar-search__item ${
                  isHighlighted ? "navbar-search__item--highlighted" : ""
                }`}
                onMouseEnter={() => setHighlight(i)}
                // mouseDown (not click) — fires before the input's blur and avoids
                // the dropdown disappearing before the navigation happens.
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(actor);
                }}
              >
                <Avatar
                  size="sm"
                  src={actor.avatar || undefined}
                  fallbackInitials={getInitials(name, actor.did)}
                />
                <div className="navbar-search__item-info">
                  <span className="navbar-search__item-name">{name}</span>
                  <span className="navbar-search__item-handle">@{actor.handle}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
