import { Heading, Text } from "@hypercerts-org/ui-react";
import type { ReactNode } from "react";

/**
 * A page's title: its one h1, at the page-title size (display-2). Every
 * heading below it, a section's or a box's, is "heading".
 */
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Heading level={1} size="display-2" className={className}>
      {children}
    </Heading>
  );
}

/**
 * A page's header: its title, an intro line under it (muted, close to the
 * title: --rhythm-title), and actions on the right.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <PageTitle>{title}</PageTitle>
        {description && <Text tone="muted">{description}</Text>}
      </div>
      {actions}
    </header>
  );
}
