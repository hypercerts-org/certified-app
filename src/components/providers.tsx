"use client";

import { UIProvider } from "@hypercerts-org/ui-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";

// TanStack Query runs the write overlay's index and PDS checks. As in the
// Next.js guide: a new client per server render, one client in the browser.
let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") return new QueryClient();
  browserQueryClient ??= new QueryClient();
  return browserQueryClient;
}

// Lets design-system buttons and rows with an href navigate through the
// Next.js router instead of full page loads.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <UIProvider link={Link}>{children}</UIProvider>
    </QueryClientProvider>
  );
}
