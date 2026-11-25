"use client";

// Explore's controls, as on staging: the tabs (All, Activities, Projects,
// Accounts), then a toolbar with the search, list or gallery, and the sort;
// on Accounts, All, People or Organizations. All of it lives in the address
// (see lib/explore-state).

import {
  Button,
  LoadingSpinner,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SearchInput,
} from "@hypercerts-org/ui-react";
import { ArrowDownUp, Check, LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LinkPending } from "@/components/link-pending";
import { ProfileTabsSkeleton } from "@/components/profile-actions";
import {
  type ExploreKind,
  type ExploreState,
  exploreFrom,
  exploreHref,
  exploreSearch,
} from "@/lib/explore-state";

const TABS: { kind: ExploreKind | "all"; label: string }[] = [
  { kind: "all", label: "All" },
  { kind: "activities", label: "Activities" },
  { kind: "projects", label: "Projects" },
  { kind: "accounts", label: "Accounts" },
];

function useExploreState(): ExploreState {
  return exploreFrom(Object.fromEntries(useSearchParams()));
}

/** The tabs, each keeping the search: a search on All carries over to Activities. */
export function ExploreTabs() {
  const pathname = usePathname();
  const { query } = useExploreState();
  const search = query ? `?q=${encodeURIComponent(query)}` : "";
  return (
    <nav aria-label="Explore" className="profile-tabs">
      {TABS.map((tab) => (
        <Link
          prefetch
          key={tab.kind}
          href={exploreHref(tab.kind, search)}
          className="profile-tab"
          aria-current={pathname === exploreHref(tab.kind) ? "page" : undefined}
        >
          {tab.label}
          <LinkPending />
        </Link>
      ))}
    </nav>
  );
}

/** The tabs while the address is read: the same row, without links yet. */
export function ExploreTabsSkeleton() {
  return <ProfileTabsSkeleton labels={TABS.map((tab) => tab.label)} />;
}

const PLACEHOLDER: Record<ExploreKind | "all", string> = {
  all: "Search all of Explore",
  activities: "Search activities",
  projects: "Search projects",
  accounts: "Search accounts",
};

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;

const ACCOUNT_TYPES = [
  { value: "all", label: "All" },
  { value: "people", label: "People" },
  { value: "organizations", label: "Organizations" },
] as const;

export function ExploreToolbar({ kind }: { kind: ExploreKind | "all" }) {
  const router = useRouter();
  const pathname = usePathname();
  const state = useExploreState();
  const [pending, startTransition] = useTransition();
  const go = (patch: Partial<ExploreState>) =>
    startTransition(() =>
      router.replace(`${pathname}${exploreSearch(state, patch)}`, { scroll: false }),
    );
  // List or gallery shows the same data: the address changes without a
  // request, and the list (which reads it) switches at once.
  const setView = (view: ExploreState["view"]) =>
    window.history.replaceState(null, "", `${pathname}${exploreSearch(state, { view })}`);

  return (
    <div className="stack">
      <div className="explore-toolbar">
        <SearchInput
          label={PLACEHOLDER[kind]}
          placeholder={PLACEHOLDER[kind]}
          value={state.query}
          debounceMs={300}
          className="explore-search"
          // A search covers the whole network, Featured or not.
          onChange={(next) => go({ query: next.trim().slice(0, 100), featured: false })}
        />
        {pending && <LoadingSpinner size={16} label="Updating results" />}
        {kind !== "all" && (
          <div className="explore-actions">
            <div className="explore-views">
              <Button
                variant="secondary"
                size="icon"
                aria-label="List view"
                pressed={state.view === "list"}
                onClick={() => setView("list")}
              >
                <List size={16} aria-hidden />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Gallery view"
                pressed={state.view === "gallery"}
                onClick={() => setView("gallery")}
              >
                <LayoutGrid size={16} aria-hidden />
              </Button>
            </div>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="Sort">
                  <ArrowDownUp size={16} aria-hidden />
                </Button>
              </MenuTrigger>
              <MenuContent label="Sort" align="end">
                {SORTS.map((sort) => (
                  <MenuItem
                    key={sort.value}
                    role="menuitemradio"
                    aria-checked={state.sort === sort.value}
                    onClick={() => go({ sort: sort.value })}
                  >
                    <Check
                      size={16}
                      aria-hidden
                      className="explore-check"
                      data-on={state.sort === sort.value || undefined}
                    />
                    {sort.label}
                  </MenuItem>
                ))}
                <MenuItem disabled={state.sort === "newest"} onClick={() => go({ sort: "newest" })}>
                  <Check size={16} aria-hidden className="explore-check" />
                  Reset to default
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        )}
      </div>
      {kind === "accounts" && !state.featured && (
        <nav aria-label="Kind of account" className="segmented-links explore-types">
          {ACCOUNT_TYPES.map((type) => (
            <Link
              key={type.value}
              href={`${pathname}${exploreSearch(state, { type: type.value })}`}
              replace
              scroll={false}
              className="segmented-link"
              aria-current={state.type === type.value ? "page" : undefined}
            >
              {type.label}
              <LinkPending />
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

/** The toolbar while the address is read: the search box's place, kept. */
export function ExploreToolbarSkeleton({ kind }: { kind: ExploreKind | "all" }) {
  return (
    <div className="explore-toolbar" aria-hidden>
      <SearchInput
        label={PLACEHOLDER[kind]}
        placeholder={PLACEHOLDER[kind]}
        value=""
        disabled
        onChange={() => {}}
        className="explore-search"
      />
    </div>
  );
}
