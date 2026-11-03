"use client";

import { useCallback, useRef, useState } from "react";

import type { Page } from "@/lib/hypercerts/views";

// Cursor pagination on the client. The first page is rendered on the server and
// passed in; later pages come from a cacheable GET route handler. Items are
// deduplicated by keyOf (a record URI or DID) because a page cached at one
// moment and a later page fetched at another can overlap when new records are
// indexed in between. keyOf must be stable, for example defined at module level.
export function useCursorPages<T>(
  initial: Page<T>,
  pageUrl: (cursor: string) => string,
  keyOf: (item: T) => string,
) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.cursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(pageUrl(cursor), {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const page = (await response.json()) as Page<T>;
      setItems((current) => {
        const seen = new Set(current.map(keyOf));
        return [...current, ...page.items.filter((item) => !seen.has(keyOf(item)))];
      });
      setCursor(page.cursor);
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(caught instanceof Error ? caught.message : "Could not load more");
    } finally {
      inFlight.current = null;
      setLoading(false);
    }
  }, [cursor, pageUrl, keyOf]);

  return { items, hasMore: cursor !== null, loading, error, loadMore };
}
