// A workspace's lists, after the staging redesign's Workspace → Lists: one
// tab per kind (activities, projects, accounts, endorsements), each showing
// the account's lists of that kind as cards. Creating and editing lists come
// with the Hypercerts SDK's writes: until then "New … list" is a placeholder.

import { Button, Card, EmptyState, Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import { Plus } from "lucide-react";
import type { ListCard } from "@/lib/hypercerts/views";

export type ListKind = {
  /** Its tab's path under the workspace's Lists ("" for the first). */
  path: string;
  /** The tab's label, and ListCard.kind of its lists. */
  label: "Activities" | "Projects" | "Accounts" | "Endorsements";
  /** One item and many: "activity", "activities". */
  item: [string, string];
  /** For "New activity list". */
  noun: string;
  /** The empty state's line. */
  about: string;
};

export const LIST_KINDS: readonly ListKind[] = [
  {
    path: "",
    label: "Activities",
    item: ["activity", "activities"],
    noun: "activity",
    about: "A list gathers activities to show together, like a portfolio or a reading list.",
  },
  {
    path: "/projects",
    label: "Projects",
    item: ["project", "projects"],
    noun: "project",
    about: "A list gathers projects to show together, like a programme or a shortlist.",
  },
  {
    path: "/accounts",
    label: "Accounts",
    item: ["account", "accounts"],
    noun: "account",
    about: "A list gathers accounts to show together, like partners or people to follow.",
  },
  {
    path: "/endorsements",
    label: "Endorsements",
    item: ["endorsement", "endorsements"],
    noun: "endorsement",
    about: "A list gathers endorsements to show together, like a set of references.",
  },
];

/** "New activity list": a placeholder until the SDK can write lists. */
export function NewListButton({ kind }: { kind: ListKind }) {
  return (
    <Button variant="secondary" size="sm" disabled title="Coming soon">
      <Plus size={16} aria-hidden />
      New {kind.noun} list
    </Button>
  );
}

/** The account's lists of one kind, as cards. */
export function ListCards({
  kind,
  lists,
  more,
}: {
  kind: ListKind;
  lists: ListCard[];
  more: boolean;
}) {
  if (lists.length === 0) {
    return <EmptyState title={`No ${kind.noun} lists yet`} description={kind.about} />;
  }
  const [one, many] = kind.item;
  return (
    <>
      <ul className="work-grid">
        {lists.map((list) => (
          <Card as="li" variant="panel" className="card" key={list.uri}>
            <Heading level={2} size="heading">
              {list.title}
            </Heading>
            <Text size="body-sm" tone="muted">
              {list.itemCount} {list.itemCount === 1 ? one : many}
            </Text>
            {list.summary && <Text size="body-sm">{list.summary}</Text>}
          </Card>
        ))}
      </ul>
      {more && (
        <Text size="body-sm" tone="muted">
          Showing the latest {lists.length}.
        </Text>
      )}
    </>
  );
}

/** Shaped like two list cards, so nothing moves when they arrive. */
export function ListCardsSkeleton() {
  return (
    <div className="work-grid" aria-hidden>
      <Skeleton variant="box" className="skeleton-list-card" />
      <Skeleton variant="box" className="skeleton-list-card" />
    </div>
  );
}
