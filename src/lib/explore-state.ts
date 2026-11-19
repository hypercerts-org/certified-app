// Explore's state lives in its address, so a search or a view can be shared:
// the tab is the path (/explore/activities), the rest is the query string:
// q (search), sort=oldest, type=people|organizations (accounts), list=featured
// and view=gallery. Defaults are left out. Shared by the server and the browser.

import type { AccountType, ExploreSort } from "@/lib/hypercerts/queries";

export type ExploreKind = "activities" | "projects" | "accounts";
export type ExploreView = "list" | "gallery";

export type ExploreState = {
  query: string;
  sort: ExploreSort;
  type: AccountType;
  featured: boolean;
  view: ExploreView;
};

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export function exploreFrom(params: Params): ExploreState {
  const type = first(params.type);
  return {
    query: first(params.q).trim().slice(0, 100),
    sort: first(params.sort) === "oldest" ? "oldest" : "newest",
    type: type === "people" || type === "organizations" ? type : "all",
    featured: first(params.list) === "featured",
    view: first(params.view) === "gallery" ? "gallery" : "list",
  };
}

/** The query string for this state ("" or "?q=…"), with `patch` applied. */
export function exploreSearch(state: ExploreState, patch: Partial<ExploreState> = {}): string {
  const next = { ...state, ...patch };
  const params = new URLSearchParams();
  if (next.query) params.set("q", next.query);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.type !== "all") params.set("type", next.type);
  if (next.featured) params.set("list", "featured");
  if (next.view !== "list") params.set("view", next.view);
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function exploreHref(kind: ExploreKind | "all", search = ""): string {
  return `${kind === "all" ? "/explore" : `/explore/${kind}`}${search}`;
}
