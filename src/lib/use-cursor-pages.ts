"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import type { Page } from "@/lib/hypercerts/views";

// Cursor pagination on the client. The first page is rendered on the server and
// passed in; later pages come from a cacheable GET route handler. Items are
// deduplicated by keyOf (a record URI or DID) because a page cached at one
// moment and a later page fetched at another can overlap when new records are
// indexed in between.
export function useCursorPages<T>(
  initial: Page<T>,
  pageUrl: (cursor: string) => string,
  keyOf: (item: T) => string,
) {
  const query = useInfiniteQuery({
    queryKey: ["pages", pageUrl("")],
    queryFn: async ({ pageParam, signal }) => {
      const response = await fetch(pageUrl(pageParam), { signal });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      return (await response.json()) as Page<T>;
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.cursor ?? undefined,
    // The server-rendered first page; pages loaded since are kept for back
    // and forward navigation. Fixed timestamps: Next.js prerenders client
    // components too, and reading the clock there drops them from the shell.
    initialData: { pages: [initial], pageParams: [""] },
    initialDataUpdatedAt: 0,
    staleTime: "static",
  });

  const seen = new Set<string>();
  const items = query.data.pages
    .flatMap((page) => page.items)
    .filter((item) => {
      const key = keyOf(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    items,
    hasMore: query.hasNextPage,
    loading: query.isFetchingNextPage,
    error: query.isFetchNextPageError ? query.error.message : null,
    loadMore: () => void query.fetchNextPage(),
  };
}
