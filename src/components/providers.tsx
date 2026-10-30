"use client";

import { UIProvider } from "@hypercerts-org/ui-react";
import Link from "next/link";
import type { ReactNode } from "react";

// Lets design-system buttons and rows with an href navigate through the
// Next.js router instead of full page loads.
export function Providers({ children }: { children: ReactNode }) {
  return <UIProvider link={Link}>{children}</UIProvider>;
}
