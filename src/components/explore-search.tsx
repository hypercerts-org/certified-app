"use client";

import { SearchInput } from "@hypercerts-org/ui-react";
import { usePathname, useRouter } from "next/navigation";

// The search term lives in the URL, so a search result page can be shared and
// is rendered on the server. Typing replaces the URL after a short debounce.
export function ExploreSearch({ query }: { query: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <SearchInput
      label="Search organizations"
      placeholder="Search organizations"
      value={query}
      debounceMs={300}
      onChange={(next) => {
        const q = next.trim();
        router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname);
      }}
    />
  );
}
