"use client";

import { usePageTitle } from "@/lib/navbar-context";

// Client-side helper that sets the navbar title via the NavbarContext.
//
// Use this inside a Server Component page so the page itself can keep
// exporting `metadata` while still participating in the titled-navbar
// layout. Renders nothing.
//
// Example (server component page):
//   export const metadata: Metadata = { title: "Settings" };
//   export default function Page() {
//     return (
//       <>
//         <PageTitle title="Settings" />
//         ...page body...
//       </>
//     );
//   }
export default function PageTitle({ title }: { title: string }) {
  usePageTitle(title);
  return null;
}
