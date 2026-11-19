// Workspace → Badges: the badges awarded to the account, by its response
// (awaiting, accepted, rejected), each with the response it can give, and
// the badges it defined for others. Responding comes with the Hypercerts
// SDK's writes: until then Accept and Reject are placeholders.

import { Plus } from "lucide-react";
import { BadgeList } from "@/components/badges";
import { ComingSoonButton } from "@/components/coming-soon";
import type { BadgeCard } from "@/lib/hypercerts/views";

export type ReceivedKind = "awaiting" | "accepted" | "rejected";

const EMPTY: Record<ReceivedKind, string> = {
  awaiting:
    "No badges are awaiting your response. When an account awards this one a badge, it shows here to accept or reject.",
  accepted: "No accepted badges yet. Accepted badges show on the profile.",
  rejected: "No rejected badges. A rejected badge never shows on the profile.",
};

/**
 * Received badges with their responses: accept or reject one awaiting a
 * response; reject an accepted one (it leaves the profile); accept a
 * rejected one again.
 */
export function ReceivedBadges({ kind, badges }: { kind: ReceivedKind; badges: BadgeCard[] }) {
  return (
    <BadgeList
      badges={badges}
      empty={EMPTY[kind]}
      actions={() => (
        <>
          {kind !== "accepted" && <ComingSoonButton variant="primary">Accept</ComingSoonButton>}
          {kind !== "rejected" && <ComingSoonButton>Reject</ComingSoonButton>}
        </>
      )}
    />
  );
}

/** "New badge": a placeholder until the SDK can write badge definitions. */
export function NewBadge() {
  return (
    <ComingSoonButton>
      <Plus size={16} aria-hidden />
      New badge
    </ComingSoonButton>
  );
}
