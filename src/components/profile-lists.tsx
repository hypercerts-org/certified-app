// A profile's lists, after staging: grouped by what they hold (activities,
// projects, accounts, endorsements), each a row with its description and how
// many items it has, leading to the list's own page. Viewing only: lists are
// managed in the workspace.

import { Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import { ChevronRight } from "lucide-react";
import { skeletonSlots } from "@/components/cards";
import { IntentLink } from "@/components/intent-link";
import { LIST_KINDS } from "@/components/workspace-lists";
import type { ListCard } from "@/lib/hypercerts/views";

export function ListGroups({ lists, base }: { lists: ListCard[]; base: string }) {
  return (
    <div className="list-groups">
      {LIST_KINDS.map((kind) => {
        const ofKind = lists.filter((list) => list.kind === kind.label);
        if (ofKind.length === 0) return null;
        return (
          <section key={kind.label} className="profile-section">
            <Heading level={2} size="heading">
              {kind.label}
              <span className="profile-section-count"> {ofKind.length}</span>
            </Heading>
            <ul className="list-rows">
              {ofKind.map((list) => (
                <li key={list.uri}>
                  <IntentLink href={`${base}/${list.rkey}`} className="list-row">
                    <span className="list-row-text">
                      <span className="list-item-title" dir="auto">
                        {list.title}
                      </span>
                      {list.summary && (
                        <span className="list-item-meta" dir="auto">
                          {list.summary}
                        </span>
                      )}
                    </span>
                    <Text as="span" size="body-sm" tone="muted" className="list-row-count">
                      {list.itemCount === 1 ? "1 item" : `${list.itemCount} items`}
                    </Text>
                    <ChevronRight size={16} aria-hidden />
                  </IntentLink>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** List groups on their way: a heading and rows. */
export function ListGroupsSkeleton() {
  return (
    <div className="list-groups" aria-hidden>
      <div className="profile-section">
        <Skeleton variant="line" className="skeleton-heading" />
        <div className="list-rows">
          {skeletonSlots(3).map((slot) => (
            <div key={slot} className="list-row">
              <Skeleton variant="text" lines={1} className="list-row-text" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
