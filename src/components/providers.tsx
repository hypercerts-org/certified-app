"use client";

import { UIProvider } from "@hypercerts-org/ui-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useState } from "react";

// Lets design-system buttons and rows with an href navigate through the
// Next.js router instead of full page loads. TanStack Query runs the write
// overlay's index and PDS checks; one client per browser session.
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <UIProvider link={Link}>{children}</UIProvider>
    </QueryClientProvider>
  );
}
