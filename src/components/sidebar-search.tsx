"use client";

// The sidebar's search, from any page: as you type, the best few activities,
// projects and accounts (Certified's first, then Bluesky's), and a row
// straight to a pasted handle, DID or link (/api/search, lib/search.ts). The
// last row, or Enter with no row picked, runs the search on Explore, with
// every result. Ctrl K (⌘K on Apple devices) puts the cursor in it.
//
// The toolkit's Combobox does the typeahead's keyboard and ARIA; this keeps
// the fetch, the groups and the rows, after staging's global search.

import { Combobox, ComboboxOption } from "@hypercerts-org/ui-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, Folder, Search, SquareCheckBig } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { ActorAvatar } from "@/components/actor";
import type { SearchResults, SearchRow } from "@/lib/search";

/** Keystrokes settle this long before a search goes out. */
const DEBOUNCE_MS = 250;
/** Shorter than this, a search would match nearly everything. */
const MIN_QUERY = 2;

const GROUP_LABEL: Record<SearchRow["kind"], string | null> = {
  go: null,
  activity: "Activities",
  project: "Projects",
  account: "Accounts",
};

type Item = SearchRow | { id: "explore"; kind: "explore"; href: string; title: string };

/** `value`, once it has stopped changing for `ms`. */
function useSettled(value: string, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const exploreHref = (query: string) => `/explore?q=${encodeURIComponent(query)}`;

/** A row's picture: an account's avatar, a record's image, or its kind's icon. */
function RowPicture({ item }: { item: Item }) {
  if (item.kind === "explore") return <Search size={16} aria-hidden className="search-row-icon" />;
  if (item.kind === "go") return <ArrowRight size={16} aria-hidden className="search-row-icon" />;
  if (item.kind === "account") {
    return (
      <ActorAvatar
        actor={{ handle: null, displayName: item.title, avatarUrl: item.imageUrl }}
        size="sm"
      />
    );
  }
  if (item.imageUrl) {
    // biome-ignore lint/performance/noImgElement: Bluesky's CDN, already sized
    return <img src={item.imageUrl} alt="" className="search-row-image" loading="lazy" />;
  }
  const Icon = item.kind === "activity" ? SquareCheckBig : Folder;
  return <Icon size={16} aria-hidden className="search-row-icon" />;
}

export function SidebarSearch() {
  const router = useRouter();
  const box = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const query = useSettled(value.trim(), DEBOUNCE_MS);
  const searching = query.length >= MIN_QUERY;

  // The server can't know the platform, so the hint appears once mounted.
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
    setShortcut(/mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K");
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const input = box.current?.querySelector("input");
        input?.focus();
        input?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useQuery<SearchResults>({
    queryKey: ["sidebar-search", query],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      return res.json();
    },
    enabled: searching,
    staleTime: 60_000,
    // The last results stay while the next ones load, so the list doesn't jump.
    placeholderData: keepPreviousData,
  });

  const data = searching ? results.data : undefined;
  const items: Item[] = searching
    ? [
        ...(data?.go ? [data.go] : []),
        ...(data?.activities ?? []),
        ...(data?.projects ?? []),
        ...(data?.accounts ?? []),
        {
          id: "explore",
          kind: "explore",
          href: exploreHref(query),
          title: `Search Explore for “${query}”`,
        },
      ]
    : [];

  const go = (href: string) => {
    setOpen(false);
    setValue("");
    box.current?.querySelector("input")?.blur();
    router.push(href);
  };

  return (
    <search>
      <form
        ref={box}
        className="sidebar-search"
        // Enter with no row picked: the search on Explore, as before.
        onSubmit={(event) => {
          event.preventDefault();
          const typed = value.trim();
          go(typed ? exploreHref(typed) : "/explore");
        }}
      >
        <Search size={16} aria-hidden className="sidebar-search-icon" />
        <Combobox<Item>
          value={value}
          onValueChange={setValue}
          items={items}
          open={open && searching}
          onOpenChange={setOpen}
          label="Search Certified"
          placeholder="Search"
          loading={searching && results.isFetching}
          emptyMessage={null}
          onSelect={(item) => go(item.href)}
          className="sidebar-search-box"
          renderItem={({ item, index, ...option }) => {
            const group = item.kind === "explore" ? null : GROUP_LABEL[item.kind];
            const startsGroup = group && (index === 0 || items[index - 1].kind !== item.kind);
            return (
              <Fragment key={item.id}>
                {startsGroup && (
                  <li role="presentation" className="search-group">
                    {group}
                  </li>
                )}
                <ComboboxOption {...option}>
                  <span className="search-row">
                    <RowPicture item={item} />
                    <span className="search-row-text">
                      <span className="ellipsis" dir="auto">
                        {item.title}
                      </span>
                      {"meta" in item && item.meta && (
                        <span className="search-row-meta ellipsis" dir="auto">
                          {item.meta}
                        </span>
                      )}
                    </span>
                  </span>
                </ComboboxOption>
              </Fragment>
            );
          }}
        />
        {shortcut && (
          <kbd className="sidebar-search-kbd" aria-hidden>
            {shortcut}
          </kbd>
        )}
      </form>
    </search>
  );
}
