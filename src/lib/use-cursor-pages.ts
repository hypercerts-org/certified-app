"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import type { Page } from "@/lib/hypercerts/views";

// Cursor pagination on the client. The first page is the server's: it comes in
// as `initial`, so when the page is refreshed (after a write, say) the list
// shows the new first page. TanStack Query holds only the pages loaded since
// ("Load more"), from a cacheable GET route handler, kept for back and forward
// navigation; they continue from the first page's cursor, so a first page
// with a new cursor starts them afresh. Items are deduplicated by keyOf (a
// record URI or DID) because pages read at different moments can overlap when
// new records are indexed in between.
export function useCursorPages<T>(
  initial: Page<T>,
  pageUrl: (cursor: string) => string,
  keyOf: (item: T) => string,
) {
  const query = useInfiniteQuery({
    queryKey: ["pages", pageUrl(""), initial.cursor],
    queryFn: async ({ pageParam, signal }) => {
      const response = await fetch(pageUrl(pageParam), { signal });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      return (await response.json()) as Page<T>;
    },
    initialPageParam: initial.cursor ?? "",
    getNextPageParam: (last) => last.cursor ?? undefined,
    // Nothing is fetched until Load more asks for it.
    enabled: false,
    staleTime: "static",
  });

  const seen = new Set<string>();
  const items = [initial, ...(query.data?.pages ?? [])]
    .flatMap((page) => page.items)
    .filter((item) => {
      const key = keyOf(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    items,
    hasMore: query.data ? query.hasNextPage : initial.cursor != null,
    loading: query.isFetching,
    error: query.isError ? query.error.message : null,
    // The first call loads the page after the server's; later ones continue.
    loadMore: () => void (query.data ? query.fetchNextPage() : query.refetch()),
  };
}
