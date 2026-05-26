import React from "react";

/**
 * Structural icon type — accepts both lucide-react icons and our
 * own wrapper components (e.g. `CertIcon` wrapping a tabler icon).
 * Both lucides and tablers expose `size` + `strokeWidth`.
 */
export type EmptyStateIcon = React.ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
}>;

export interface EmptyStateProps {
  icon?: EmptyStateIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Reusable empty/placeholder state shown when a list or section has no content.
 * Renders a centered block with optional icon, title, description, and CTA slot.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`}>
      {Icon && (
        <div className="empty-state__icon" aria-hidden="true">
          <Icon size={40} strokeWidth={1.2} />
        </div>
      )}
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__desc">{description}</p>}
      {children && <div className="empty-state__actions">{children}</div>}
    </div>
  );
}
