"use client";

import { UIProvider } from "@hypercerts-org/ui-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, Suspense } from "react";
import { Toaster } from "sonner";
import { IntentLink } from "@/components/intent-link";
import { ScrollToTop } from "@/components/scroll-to-top";
import { ThemeSync } from "@/components/theme-control";
import { HttpError } from "@/lib/query-keys";

// TanStack Query backs client-side reads and coordination: paginated lists
// ("Load more"), live search/picker typeahead, the user's organizations,
// batched timeline likes, and place lookups. As in the Next.js guide: a new
// client per server render, one singleton client in the browser.
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 1;
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

// Design-system buttons and rows with an href navigate through the Next.js
// router, prefetching the destination's content on intent (IntentLink):
// many of them sit in lists and grids.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <UIProvider link={IntentLink}>
        <ThemeSync />
        <Suspense fallback={null}>
          <ScrollToTop />
        </Suspense>
        {children}
        {/* Above the phone tab bar, which covers the bottom 3.5rem. */}
        <Toaster
          position="bottom-left"
          mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        />
      </UIProvider>
    </QueryClientProvider>
  );
}
