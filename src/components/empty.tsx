import { EmptyState } from "@hypercerts-org/ui-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

type EmptyStateProps = ComponentProps<typeof EmptyState>;

/**
 * The app's one empty state: no frame, an icon (the one the section has in
 * the navigation), a title, a line saying what will show up here, and at
 * most one action. Never a bare box.
 */
export function Empty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: EmptyStateProps["title"];
  description?: EmptyStateProps["description"];
  action?: EmptyStateProps["action"];
}) {
  return (
    <EmptyState
      className="empty"
      icon={<Icon size={32} strokeWidth={1.25} aria-hidden />}
      title={title}
      description={description}
      action={action}
    />
  );
}
