"use client";

import { UIProvider } from "@hypercerts-org/ui-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Toaster } from "sonner";

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
// router. They prefetch the destination's cached content too, not only its
// shared shell, so following one shows the page at once instead of its
// skeletons (docs: optimizing-prefetching, "Resolve URL data at prefetch time").
function PrefetchingLink(props: ComponentProps<typeof Link>) {
  return <Link prefetch {...props} />;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <UIProvider link={PrefetchingLink}>
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
