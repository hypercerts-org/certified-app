"use client";

// Which account this browser is signed in as, for the write overlay. Public
// pages are cached for everyone, so they can't render it; the header's account
// area (rendered per request) reports it through <ViewerSync>, and components
// read it with useViewer(), React's pattern for an external store. Until it is
// known, and when signed out, no local saves are shown.

import { useEffect, useSyncExternalStore } from "react";

let viewer: string | null | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in account's DID: null when signed out, undefined until known. */
export function useViewer(): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => viewer,
    () => undefined,
  );
}

/** Reports the signed-in account; rendered by the header's account area. */
export function ViewerSync({ did }: { did: string | null }) {
  useEffect(() => {
    if (viewer === did) return;
    viewer = did;
    for (const listener of listeners) listener();
  }, [did]);
  return null;
}
