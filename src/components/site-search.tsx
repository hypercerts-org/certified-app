"use client";

// The site's search, from any page (in the sidebar; on a phone, behind the
// header's search button): as you type, the best few activities,
// projects and accounts (Certified's first, then Bluesky's), and a row
// straight to a pasted handle, DID or link (/api/search, lib/search.ts). The
// last row, or Enter with no row picked, runs the search on Explore, with
// every result. In the sidebar, Ctrl K (⌘K on Apple devices) puts the cursor
// in it.
//
// The toolkit's Combobox does the typeahead's keyboard and ARIA; this keeps
// the fetch, the groups and the rows, after staging's global search.

import {
  Avatar,
  Button,
  Combobox,
  ComboboxOption,
  ResponsiveDialog,
} from "@hypercerts-org/ui-react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Folder, Search, SquareCheckBig } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { avatarOf } from "@/components/actor";
import { sidebarSearchQuery } from "@/lib/query-keys";
import type { SearchRow } from "@/lib/search";
import { useSettled } from "@/lib/use-settled";

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

const exploreHref = (query: string) => `/explore?q=${encodeURIComponent(query)}`;

/** A row's picture: an account's avatar, a record's image, or its kind's icon. */
function RowPicture({ item }: { item: Item }) {
  if (item.kind === "explore") return <Search size={16} aria-hidden className="search-row-icon" />;
  if (item.kind === "go") return <ArrowRight size={16} aria-hidden className="search-row-icon" />;
  if (item.kind === "account") {
    return (
      <Avatar
        {...avatarOf({
          handle: null,
          displayName: item.title,
          avatarUrl: item.imageUrl,
          isOrganization: !item.round,
        })}
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

/**
 * The search box and its results. `shortcut`: Ctrl K / ⌘K focuses it, with
 * the hint shown (the sidebar's). `inline`: the results lie under the box
 * instead of over the page (the phone's dialog), and it takes the focus.
 * `onNavigate`: after a row or Enter leads somewhere.
 */
function SearchBox({
  shortcut: withShortcut = false,
  inline = false,
  onNavigate,
}: {
  shortcut?: boolean;
  inline?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const query = useSettled(value.trim(), DEBOUNCE_MS);
  const searching = query.length >= MIN_QUERY;

  // The server can't know the platform, so the hint appears once mounted.
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    if (inline) input.current?.focus();
    if (!withShortcut) return;
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
    setShortcut(/mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K");
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [withShortcut, inline]);

  const results = useQuery(sidebarSearchQuery(query, searching));

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
    input.current?.blur();
    onNavigate?.();
    router.push(href);
  };

  return (
    <search>
      <form
        className="sidebar-search"
        // Enter with no row picked: the search on Explore, as before.
        onSubmit={(event) => {
          event.preventDefault();
          const typed = value.trim();
          go(typed ? exploreHref(typed) : "/explore");
        }}
      >
        <Combobox<Item>
          value={value}
          onValueChange={setValue}
          items={items}
          open={open && searching}
          onOpenChange={setOpen}
          label="Search Certified"
          placeholder={inline ? "Accounts, projects, activities…" : "Search"}
          loading={searching && results.isFetching}
          emptyMessage={null}
          onSelect={(item) => go(item.href)}
          inputRef={input}
          size="sm"
          inline={inline}
          // Over the page, the list may be wider than the sidebar.
          listboxClassName={inline ? undefined : "sidebar-search-list"}
          leading={<Search size={16} aria-hidden />}
          trailing={
            shortcut && (
              <kbd className="sidebar-search-kbd" aria-hidden>
                {shortcut}
              </kbd>
            )
          }
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
      </form>
    </search>
  );
}

/** The sidebar's search, with Ctrl K / ⌘K. */
export function SidebarSearch() {
  return <SearchBox shortcut />;
}

/** On narrow screens (no sidebar): a search button in the header, opening the search in a dialog. */
export function MobileSearchButton() {
  const [open, setOpen] = useState(false);
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
        {open && <SearchBox inline onNavigate={() => setOpen(false)} />}
      </ResponsiveDialog>
    </>
  );
}
