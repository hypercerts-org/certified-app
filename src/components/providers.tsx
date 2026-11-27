"use client";

import { UIProvider } from "@hypercerts-org/ui-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, Suspense } from "react";
import { Toaster } from "sonner";
import { IntentLink } from "@/components/intent-link";
import { ScrollToTop } from "@/components/scroll-to-top";
import { ThemeSync } from "@/components/theme-control";

// TanStack Query: "load more" lists, the write overlay's index polling and
// the forms' mutations. As in the Next.js guide: a new client per server
// render, one client in the browser.
let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") return new QueryClient();
  browserQueryClient ??= new QueryClient();
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
