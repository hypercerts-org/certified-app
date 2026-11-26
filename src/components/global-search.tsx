"use client";

// Live global search across Certified accounts, Bluesky accounts, projects,
// and activities (`/api/search`). Renders inline in the desktop sidebar (with
// ⌘K / Ctrl K) and as a compact search button + dialog in the mobile header.

import { Button, LoadingSpinner, ResponsiveDialog } from "@hypercerts-org/ui-react";
import { CornerDownLeft, Folder, Search, SquareCheckBig } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { SearchActorHit, SearchRecordHit } from "@/app/api/search/route";
import { ActorAvatar } from "@/components/actor";

type SearchPayload = {
  actors: SearchActorHit[];
  projects: SearchRecordHit[];
  activities: SearchRecordHit[];
};

type FlatItem =
  | { kind: "actor"; key: string; href: string; actor: SearchActorHit }
  | { kind: "project"; key: string; href: string; record: SearchRecordHit }
  | { kind: "activity"; key: string; href: string; record: SearchRecordHit }
  | { kind: "explore"; key: string; href: string; query: string };

function useLiveSearch(query: string, enabled: boolean) {
  const [data, setData] = useState<SearchPayload>({ actors: [], projects: [], activities: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < 2) {
      setData({ actors: [], projects: [], activities: [] });
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?${new URLSearchParams({ q, scope: "all", limit: "5" })}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const payload = (await res.json()) as Partial<SearchPayload>;
        if (!controller.signal.aborted) {
          setData({
            actors: payload.actors ?? [],
            projects: payload.projects ?? [],
            activities: payload.activities ?? [],
          });
        }
      } catch {
        // Ignore aborted / offline queries.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled]);

  return { data, loading };
}

function buildFlatItems(query: string, data: SearchPayload): FlatItem[] {
  const q = query.trim();
  const items: FlatItem[] = [];
  for (const actor of data.actors) {
    items.push({ kind: "actor", key: `a:${actor.did}`, href: actor.href, actor });
  }
  for (const record of data.projects) {
    items.push({ kind: "project", key: `p:${record.uri}`, href: record.href, record });
  }
  for (const record of data.activities) {
    items.push({ kind: "activity", key: `c:${record.uri}`, href: record.href, record });
  }
  if (q.length > 0) {
    items.push({
      kind: "explore",
      key: "explore",
      href: `/explore?${new URLSearchParams({ q })}`,
      query: q,
    });
  }
  return items;
}

function SearchResultsList({
  listboxId,
  items,
  activeIndex,
  onHover,
  onSelect,
}: {
  listboxId: string;
  items: FlatItem[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (href: string) => void;
}) {
  const actors = items.filter((item) => item.kind === "actor");
  const projects = items.filter((item) => item.kind === "project");
  const activities = items.filter((item) => item.kind === "activity");
  const explore = items.find((item) => item.kind === "explore");

  const indexOf = (key: string) => items.findIndex((item) => item.key === key);

  return (
    <div id={listboxId} role="listbox" className="global-search-list">
      {actors.length > 0 && (
        <div role="presentation" className="global-search-group">
          Accounts
        </div>
      )}
      {actors.map((item) => {
        const idx = indexOf(item.key);
        return (
          <div
            key={item.key}
            id={`${listboxId}-${idx}`}
            role="option"
            tabIndex={-1}
            aria-selected={idx === activeIndex}
            className={
              idx === activeIndex ? "typeahead-option typeahead-option--active" : "typeahead-option"
            }
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(item.href);
            }}
            onMouseEnter={() => onHover(idx)}
          >
            <ActorAvatar actor={item.actor} size="sm" />
            <span className="typeahead-text">
              <span className="typeahead-primary" dir="auto">
                {item.actor.displayName}
              </span>
              {item.actor.handle && (
                <span className="typeahead-secondary">@{item.actor.handle}</span>
              )}
            </span>
            {item.actor.certified && <span className="typeahead-tag">Certified</span>}
          </div>
        );
      })}

      {projects.length > 0 && (
        <div role="presentation" className="global-search-group">
          Projects
        </div>
      )}
      {projects.map((item) => {
        const idx = indexOf(item.key);
        return (
          <div
            key={item.key}
            id={`${listboxId}-${idx}`}
            role="option"
            tabIndex={-1}
            aria-selected={idx === activeIndex}
            className={
              idx === activeIndex ? "typeahead-option typeahead-option--active" : "typeahead-option"
            }
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(item.href);
            }}
            onMouseEnter={() => onHover(idx)}
          >
            <span className="global-search-icon" aria-hidden>
              <Folder size={16} />
            </span>
            <span className="typeahead-text">
              <span className="typeahead-primary" dir="auto">
                {item.record.title}
              </span>
              <span className="typeahead-secondary">{item.record.authorName}</span>
            </span>
          </div>
        );
      })}

      {activities.length > 0 && (
        <div role="presentation" className="global-search-group">
          Activities
        </div>
      )}
      {activities.map((item) => {
        const idx = indexOf(item.key);
        return (
          <div
            key={item.key}
            id={`${listboxId}-${idx}`}
            role="option"
            tabIndex={-1}
            aria-selected={idx === activeIndex}
            className={
              idx === activeIndex ? "typeahead-option typeahead-option--active" : "typeahead-option"
            }
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(item.href);
            }}
            onMouseEnter={() => onHover(idx)}
          >
            <span className="global-search-icon" aria-hidden>
              <SquareCheckBig size={16} />
            </span>
            <span className="typeahead-text">
              <span className="typeahead-primary" dir="auto">
                {item.record.title}
              </span>
              <span className="typeahead-secondary">{item.record.authorName}</span>
            </span>
          </div>
        );
      })}

      {explore && (
        <div
          key={explore.key}
          id={`${listboxId}-${indexOf(explore.key)}`}
          role="option"
          tabIndex={-1}
          aria-selected={indexOf(explore.key) === activeIndex}
          className={
            indexOf(explore.key) === activeIndex
              ? "typeahead-option global-search-explore typeahead-option--active"
              : "typeahead-option global-search-explore"
          }
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(explore.href);
          }}
          onMouseEnter={() => onHover(indexOf(explore.key))}
        >
          <Search size={15} aria-hidden />
          <span className="typeahead-primary">Search Explore for “{explore.query}”</span>
          <CornerDownLeft size={14} aria-hidden className="global-search-enter" />
        </div>
      )}
    </div>
  );
}

/**
 * Live search box in the desktop sidebar, with ⌘K / Ctrl K focus shortcut and
 * instant results for accounts, projects, and activities.
 */
export function GlobalSidebarSearch() {
  const router = useRouter();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [shortcut, setShortcut] = useState<string | null>(null);

  const { data, loading } = useLiveSearch(query, open);
  const items = useMemo(() => buildFlatItems(query, data), [query, data]);

  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
    setShortcut(/mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K");

    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        // Only hijack focus when the sidebar is visible (desktop).
        if (!inputRef.current || inputRef.current.offsetParent === null) return;
        event.preventDefault();
        inputRef.current.focus();
        inputRef.current.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
      inputRef.current?.blur();
      router.push(href);
    },
    [router],
  );

  const showMenu = open && query.trim().length > 0;

  return (
    <div ref={rootRef} className="global-search">
      <search>
        <form
          className="sidebar-search"
          onSubmit={(event) => {
            event.preventDefault();
            const chosen = activeIndex >= 0 ? items[activeIndex] : undefined;
            if (chosen) {
              navigate(chosen.href);
            } else if (query.trim()) {
              navigate(`/explore?${new URLSearchParams({ q: query.trim() })}`);
            } else {
              navigate("/explore");
            }
          }}
        >
          <Search size={16} aria-hidden className="sidebar-search-icon" />
          <input
            ref={inputRef}
            type="search"
            name="q"
            role="combobox"
            aria-expanded={showMenu}
            aria-controls={showMenu ? listboxId : undefined}
            aria-activedescendant={
              showMenu && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
            }
            aria-autocomplete="list"
            placeholder="Search"
            aria-label="Search Certified"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(-1);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (!showMenu || items.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((prev) => (prev + 1) % items.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
              } else if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              }
            }}
          />
          {loading ? (
            <span className="sidebar-search-spinner" aria-hidden>
              <LoadingSpinner size={14} label="Searching" />
            </span>
          ) : (
            shortcut && (
              <kbd className="sidebar-search-kbd" aria-hidden>
                {shortcut}
              </kbd>
            )
          )}
        </form>
      </search>

      {showMenu && items.length > 0 && (
        <div className="global-search-popover">
          <SearchResultsList
            listboxId={listboxId}
            items={items}
            activeIndex={activeIndex}
            onHover={setActiveIndex}
            onSelect={navigate}
          />
        </div>
      )}
    </div>
  );
}

/** Compact search button + live dialog for narrow screens (mobile/tablet header). */
export function MobileSearchButton() {
  const router = useRouter();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const { data, loading } = useLiveSearch(query, open);
  const items = useMemo(() => buildFlatItems(query, data), [query, data]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search Certified"
        onClick={() => setOpen(true)}
      >
        <Search size={18} aria-hidden />
      </Button>
      <ResponsiveDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Search Certified"
        size="sm"
      >
        <div className="stack">
          <search>
            <form
              className="sidebar-search"
              onSubmit={(event) => {
                event.preventDefault();
                const chosen = activeIndex >= 0 ? items[activeIndex] : undefined;
                if (chosen) navigate(chosen.href);
                else if (query.trim()) {
                  navigate(`/explore?${new URLSearchParams({ q: query.trim() })}`);
                }
              }}
            >
              <Search size={16} aria-hidden className="sidebar-search-icon" />
              <input
                ref={inputRef}
                type="search"
                placeholder="Accounts, projects, activities…"
                aria-label="Search Certified"
                enterKeyHint="search"
                autoComplete="off"
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveIndex(-1);
                }}
                onKeyDown={(event) => {
                  if (items.length === 0) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((prev) => (prev + 1) % items.length);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
                  }
                }}
              />
              {loading && (
                <span className="sidebar-search-spinner" aria-hidden>
                  <LoadingSpinner size={14} label="Searching" />
                </span>
              )}
            </form>
          </search>

          {items.length > 0 && (
            <SearchResultsList
              listboxId={listboxId}
              items={items}
              activeIndex={activeIndex}
              onHover={setActiveIndex}
              onSelect={navigate}
            />
          )}
        </div>
      </ResponsiveDialog>
    </>
  );
}
