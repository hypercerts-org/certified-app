import { Card, Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import { type ReactNode, useId } from "react";

/** Standard content stack for a settings sub-page: optional muted intro + settings cards. */
export function SettingsSection({
  description,
  children,
}: {
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-panel">
      {description && (
        <Text tone="muted" className="measure settings-panel-intro">
          {description}
        </Text>
      )}
      <div className="settings">{children}</div>
    </div>
  );
}

/**
 * Structured Vercel-style settings card built on `@hypercerts-org/ui-react`'s
 * `Card`: crisp surface body for title, description and value/form, paired
 * with a tinted footer bar holding a quiet left-aligned hint and consistently
 * right-aligned action buttons.
 */
export function SettingsCard({
  title,
  description,
  headerAction,
  hint,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Optional control aligned to the top-right of the card header. */
  headerAction?: ReactNode;
  /** Quiet helper copy aligned to the left of the footer bar. */
  hint?: ReactNode;
  /** Action button(s) aligned to the right of the footer bar. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const titleId = useId();
  const hasFooter = hint !== undefined || actions !== undefined;
  return (
    <Card variant="panel" as="section" aria-labelledby={titleId} className="settings-card">
      <div className="settings-card-body">
        <div className="settings-card-head">
          <div className="section-heading">
            <Heading level={2} size="heading" id={titleId}>
              {title}
            </Heading>
            {description && (
              <Text size="body-sm" tone="muted" className="measure">
                {description}
              </Text>
            )}
          </div>
          {headerAction && <div className="settings-card-head-action">{headerAction}</div>}
        </div>
        {children}
      </div>
      {hasFooter && (
        <div className="settings-card-footer">
          <div className="settings-card-hint">
            {hint ? (
              <Text size="body-sm" tone="muted">
                {hint}
              </Text>
            ) : null}
          </div>
          {actions && <div className="settings-card-actions">{actions}</div>}
        </div>
      )}
    </Card>
  );
}

const SKELETON_KEYS = ["card-1", "card-2", "card-3", "card-4", "card-5"] as const;

/** Card-shaped loading placeholders matching `SettingsCard` geometry. */
export function SettingsCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="settings" aria-hidden>
      {SKELETON_KEYS.slice(0, count).map((key) => (
        <Card key={key} variant="panel" className="settings-card">
          <div className="settings-card-body">
            <Skeleton variant="line" className="skeleton-heading" />
            <Skeleton variant="text" lines={2} />
          </div>
          <div className="settings-card-footer">
            <Skeleton variant="line" className="skeleton-meta" />
            <Skeleton variant="box" className="skeleton-control" />
          </div>
        </Card>
      ))}
    </div>
  );
}
