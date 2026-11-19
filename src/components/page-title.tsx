import { Heading } from "@hypercerts-org/ui-react";
import type { ReactNode } from "react";

/**
 * A page's title: its one h1, at the brand's page-title size. Every heading
 * below it, a section's or a box's, is "heading" (a compact page, as on
 * staging).
 */
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Heading level={1} size="display-2" className={className}>
      {children}
    </Heading>
  );
}
