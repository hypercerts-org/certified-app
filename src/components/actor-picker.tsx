"use client";

// Shared AT Protocol / Certified actor typeahead input backed by
// `/api/search?scope=actors`. Used in Add member, Endorse someone, Award
// badge, and Activity contributors. Free-form text (DIDs, URLs, AT-URIs, or
// names) still submits cleanly without picking a row.

import { Input, LoadingSpinner } from "@hypercerts-org/ui-react";
import { useEffect, useId, useRef, useState } from "react";
import { ActorAvatar } from "@/components/actor";
import type { SearchActorHit } from "@/lib/search";

export function ActorPicker({
  id,
  value,
  onChange,
  onSelectActor,
  onBlur,
  placeholder = "@alice.bsky.social",
  required,
  disabled,
  invalid,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
  /** How a picked actor fills the input: `"handle"` (default) or `"did"`. */
  valueFormat = "handle",
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  onSelectActor?: (actor: SearchActorHit) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
  valueFormat?: "handle" | "did";
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchActorHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Suppress re-query right after the user explicitly selects a suggestion.
  const pickedRef = useRef<string | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (
      !open ||
      q.length < 2 ||
      q.startsWith("http://") ||
      q.startsWith("https://") ||
      q.startsWith("at://") ||
      pickedRef.current === q
    ) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?${new URLSearchParams({ q, scope: "actors", limit: "6" })}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { actors?: SearchActorHit[] };
        if (!controller.signal.aborted) {
          setResults(data.actors ?? []);
          setActiveIndex(-1);
        }
      } catch {
        // Aborted or transient network failure; keep manual typing working.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const choose = (actor: SearchActorHit) => {
    const next = valueFormat === "did" ? actor.did : actor.handle ? `@${actor.handle}` : actor.did;
    pickedRef.current = next;
    onChange(next);
    onSelectActor?.(actor);
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
  };

  const showMenu = open && (loading || results.length > 0);

  return (
    <div ref={rootRef} className="typeahead">
      <div className="typeahead-field">
        <Input
          id={id}
          role="combobox"
          aria-expanded={showMenu}
          aria-controls={showMenu ? listboxId : undefined}
          aria-activedescendant={
            showMenu && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-describedby={ariaDescribedBy}
          aria-label={ariaLabel}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          invalid={invalid}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            onBlur?.();
          }}
          onChange={(event) => {
            pickedRef.current = null;
            onChange(event.currentTarget.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (!showMenu || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((prev) => (prev + 1) % results.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              choose(results[activeIndex]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        {loading && (
          <span className="typeahead-spinner" aria-hidden>
            <LoadingSpinner size={14} label="Searching accounts" />
          </span>
        )}
      </div>

      {showMenu && results.length > 0 && (
        <div id={listboxId} role="listbox" className="typeahead-menu">
          {results.map((actor, index) => (
            <div
              key={actor.did}
              id={`${listboxId}-${index}`}
              role="option"
              tabIndex={-1}
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? "typeahead-option typeahead-option--active"
                  : "typeahead-option"
              }
              onMouseDown={(event) => {
                event.preventDefault();
                choose(actor);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <ActorAvatar actor={actor} size="sm" />
              <span className="typeahead-text">
                <span className="typeahead-primary" dir="auto">
                  {actor.displayName}
                </span>
                {actor.handle && <span className="typeahead-secondary">@{actor.handle}</span>}
              </span>
              {actor.certified && <span className="typeahead-tag">Certified</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
