import { Button } from "@hypercerts-org/ui-react";
import type { ReactNode } from "react";

export const COMING_SOON = "Coming soon";

/**
 * An action the app can't do yet (it waits for the Hypercerts SDK's writes):
 * shown so the page has its final shape, disabled, with the reason as a
 * tooltip and for screen readers. Small, secondary unless it is the view's
 * one primary action. Every placeholder button is one of these.
 */
export function ComingSoonButton({
  children,
  variant = "secondary",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Button variant={variant} size="sm" disabled title={COMING_SOON}>
      {children}
      <span className="visually-hidden"> ({COMING_SOON.toLowerCase()})</span>
    </Button>
  );
}
