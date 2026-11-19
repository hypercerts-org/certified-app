// Workspace → Badges: the badges awarded to the account, by its response
// (awaiting, accepted, rejected), each with the response it can give, and
// the badges it defined for others. Responding comes with the Hypercerts
// SDK's writes: until then Accept and Reject are placeholders.

import { Plus } from "lucide-react";
import { BadgeList } from "@/components/badges";
import { ComingSoonButton } from "@/components/coming-soon";
import type { BadgeCard } from "@/lib/hypercerts/views";

export type ReceivedKind = "awaiting" | "accepted" | "rejected";

const EMPTY: Record<ReceivedKind, { title: string; description: string }> = {
  awaiting: {
    title: "No badges awaiting a response",
    description: "When an account awards you a badge, it shows here to accept or reject.",
  },
  accepted: {
    title: "No badges accepted yet",
    description: "Badges you accept show on your profile.",
  },
  rejected: {
    title: "No badges rejected yet",
    description: "A badge you reject never shows on your profile.",
  },
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
      empty={EMPTY[kind].title}
      emptyDescription={EMPTY[kind].description}
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
