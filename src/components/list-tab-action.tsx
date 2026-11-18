"use client";

import { usePathname } from "next/navigation";
import { LIST_KINDS, NewListButton } from "@/components/workspace-lists";

/** "New … list" for the open Lists tab, on the tab line (as on staging). */
export function ListTabAction({ base }: { base: string }) {
  const pathname = decodeURIComponent(usePathname());
  const kind =
    LIST_KINDS.find((k) => k.path && pathname.startsWith(`${base}${k.path}`)) ?? LIST_KINDS[0];
  return <NewListButton kind={kind} />;
}
