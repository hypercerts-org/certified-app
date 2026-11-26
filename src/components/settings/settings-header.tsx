// The head of both settings pages, personal and group, so it is always clear
// whose settings these are: the account's picture, which settings they are
// ("Personal settings", "Group settings"), the account's name and its handle
// (and, for a group, the user's role in it), with the page's links at the end.

import { Skeleton, Text } from "@hypercerts-org/ui-react";
import type { ReactNode } from "react";
import { ActorAvatar, type ActorLike } from "@/components/actor";
import { PageTitle } from "@/components/page-title";
import { nameOf } from "@/lib/hypercerts/views";

export function SettingsHeader({
  title,
  actor,
  note,
  actions,
}: {
  /** "Personal settings" or "Group settings". */
  title: string;
  /** The account whose settings these are. */
  actor: ActorLike;
  /** After the handle: the user's role in a group. */
  note?: string;
  actions?: ReactNode;
}) {
  // The handle, unless the name already is it (an account without a name).
  const handle = actor.handle && nameOf(actor) !== `@${actor.handle}` ? `@${actor.handle}` : null;
  const details = [handle, note].filter(Boolean).join(" · ");
  return (
    <header className="settings-header">
      <div className="settings-header-identity">
        <ActorAvatar actor={actor} size="lg" />
        <div className="settings-header-text">
          <PageTitle>{title}</PageTitle>
          <div className="settings-header-who">
            <Text className="settings-header-name" dir="auto">
              {nameOf(actor)}
            </Text>
            {details && (
              <Text size="body-sm" tone="muted">
                {details}
              </Text>
            )}
          </div>
        </div>
      </div>
      {actions && <div className="settings-header-actions">{actions}</div>}
    </header>
  );
}

/** A settings page's head on its way: the same picture, title and lines. */
export function SettingsHeaderSkeleton({ title }: { title: string }) {
  return (
    <header className="settings-header">
      <div className="settings-header-identity">
        <Skeleton variant="circle" className="settings-header-avatar-skeleton" />
        <div className="settings-header-text">
          <PageTitle>{title}</PageTitle>
          <Skeleton variant="text" lines={2} className="settings-header-lines-skeleton" />
        </div>
      </div>
    </header>
  );
}
