// Shared TanStack Query keys and `queryOptions` factories for client-side
// reads. Keeping keys and fetchers here prevents key drift across components,
// ensures every request forwards `AbortSignal`, and attaches HTTP status codes
// (`HttpError`) so `QueryClient` can skip retrying 4xx responses.

import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { Organization } from "@/lib/organizations";
import type { SearchActorHit, SearchResults } from "@/lib/search";

/** Error thrown by `fetchJson` with the HTTP status so retries can skip 4xx. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `Request failed (${status})`);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Fetches JSON from an internal route handler, throwing `HttpError` on non-2xx. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new HttpError(response.status, `${url} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export type LikeEntry = { count: number; likeUri: string | null };
export type LikesBatchResponse = {
  actor: string | null;
  likes: Record<string, LikeEntry>;
};
export type PlaceHit = { id: string; name: string; lat: number; lng: number };
export type ActorPickerItem = SearchActorHit & { id: string };

/** Canonical query keys for invalidation, cache updates, and deduplication. */
export const queryKeys = {
  myOrganizations: ["me", "organizations"] as const,
  likesAll: ["likes"] as const,
  likesBatch: (subjects: readonly string[]) => ["likes", ...subjects] as const,
  sidebarSearch: (query: string) => ["sidebar-search", query] as const,
  actorPicker: (query: string) => ["actor-picker", query] as const,
  placeSearch: (query: string) => ["place-search", query] as const,
};

/** The signed-in user's organizations, kept fresh for 5 minutes like the server cache. */
export function myOrganizationsQuery() {
  return queryOptions({
    queryKey: queryKeys.myOrganizations,
    queryFn: async ({ signal }): Promise<Organization[]> => {
      const data = await fetchJson<{ organizations: Organization[] }>("/api/me/organizations", {
        signal,
      });
      return data.organizations;
    },
    staleTime: 5 * 60_000,
  });
}

/** One batched `/api/likes` fetch for up to 50 sorted subject AT-URIs. */
export function likesBatchQuery(subjects: readonly string[]) {
  return queryOptions({
    queryKey: queryKeys.likesBatch(subjects),
    queryFn: async ({ signal }): Promise<LikesBatchResponse> => {
      const params = new URLSearchParams();
      for (const uri of subjects) params.append("subjects", uri);
      return fetchJson<LikesBatchResponse>(`/api/likes?${params.toString()}`, { signal });
    },
    staleTime: 60_000,
  });
}

/** Sidebar global search results, keeping previous items visible while typing. */
export function sidebarSearchQuery(query: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.sidebarSearch(query),
    queryFn: ({ signal }) =>
      fetchJson<SearchResults>(`/api/search?q=${encodeURIComponent(query)}`, { signal }),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Account typeahead suggestions for `ActorPicker`. */
export function actorPickerQuery(query: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.actorPicker(query),
    queryFn: async ({ signal }): Promise<ActorPickerItem[]> => {
      const params = new URLSearchParams({ q: query, scope: "actors", limit: "6" });
      const data = await fetchJson<{ actors?: SearchActorHit[] }>(`/api/search?${params}`, {
        signal,
      });
      return (data.actors ?? []).map((actor) => ({ ...actor, id: actor.did }));
    },
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Place search suggestions for `LocationPicker` (Nominatim via `/api/places`). */
export function placeSearchQuery(query: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.placeSearch(query),
    queryFn: async ({ signal }): Promise<PlaceHit[]> => {
      const data = await fetchJson<{ places: Omit<PlaceHit, "id">[] }>(
        `/api/places?${new URLSearchParams({ q: query })}`,
        { signal },
      );
      return data.places.map((place, index) => ({ ...place, id: `place-${index}` }));
    },
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
