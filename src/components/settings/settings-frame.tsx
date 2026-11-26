import { Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import Link from "next/link";
import { type ButtonHTMLAttributes, type ReactNode, useId } from "react";

/** Full-width settings sub-page wrapper. */
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

/** A titled group of hairline-separated settings rows (e.g. "Details", "Organization details"). */
export function SettingsGroup({
  title,
  description,
  action,
  children,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="settings-group" aria-labelledby={title ? titleId : undefined}>
      {title && (
        <div className="settings-group-head">
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
          {action && <div className="settings-group-action">{action}</div>}
        </div>
      )}
      <div className="settings-rows">{children}</div>
    </section>
  );
}

/**
 * Full-width 3-column editorial settings row separated by hairlines:
 *   Left   — label + optional 1-line description
 *   Middle — current value or expanded inline editor
 *   Right  — quiet right-aligned text action(s) ("Edit", "Delete  Upload", etc.)
 */
export function SettingsRow({
  label,
  description,
  actions,
  children,
}: {
  label: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span className="settings-row-title">{label}</span>
        {description && (
          <Text size="body-sm" tone="muted" className="settings-row-desc">
            {description}
          </Text>
        )}
      </div>
      <div className="settings-row-value">{children}</div>
      {actions !== undefined && <div className="settings-row-actions">{actions}</div>}
    </div>
  );
}

/** Quiet underlined text action for the right column of a `SettingsRow`. */
export function SettingsAction({
  tone = "default",
  href,
  className,
  children,
  ...rest
}: {
  tone?: "default" | "muted" | "danger";
  href?: string;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  const cls = [
    "settings-action",
    tone === "muted" && "settings-action-muted",
    tone === "danger" && "settings-action-danger",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

const SKELETON_KEYS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"] as const;

/** Row-shaped loading placeholders matching `SettingsRow` geometry. */
export function SettingsRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="settings-rows" aria-hidden>
      {SKELETON_KEYS.slice(0, rows).map((key) => (
        <div key={key} className="settings-row">
          <div className="settings-row-label">
            <Skeleton variant="line" className="skeleton-label" />
            <Skeleton variant="line" className="skeleton-meta" />
          </div>
          <div className="settings-row-value">
            <Skeleton variant="line" className="skeleton-heading" />
          </div>
          <div className="settings-row-actions">
            <Skeleton variant="line" className="skeleton-label" />
          </div>
        </div>
      ))}
    </div>
  );
}
