import { Heading } from "@hypercerts-org/ui-react";
import type { ReactNode } from "react";

/**
 * A page's title: its one h1, at the brand's page-title size. Sections in the
 * page flow are display-3, headings inside a card or box are "heading".
 */
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Heading level={1} size="display-2" className={className}>
      {children}
    </Heading>
  );
}
