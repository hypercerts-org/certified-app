// What to show for a profile while the index catches up with saved writes,
// and how index and PDS reads settle the local operations. Pure functions over
// plain values: the React hooks in ./use-profile only wire them to IndexedDB
// and TanStack Query.
//
// Precedence follows the write-consistency handoff: the newest local operation
// wins over indexed data until the index shows the exact version (CID) that
// was saved. CIDs identify versions, not their order, so they are only ever
// compared for equality.
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";
import type { ProfileOperation } from "./local-store";

/** saving: sent, no answer yet. checking: outcome unknown, reading the PDS.
 *  syncing: saved, the index hasn't shown it yet. */
export type ProfileStatus = "saving" | "checking" | "syncing" | null;

export type ProfileDisplay = { fields: ProfileFields; status: ProfileStatus };

const NO_PROFILE: ProfileFields = { displayName: "", description: "" };

const fieldsOf = ({ displayName, description }: ProfileFields): ProfileFields => ({
  displayName,
  description,
});

function newest(operations: ProfileOperation[]): ProfileOperation | undefined {
  return operations.reduce<ProfileOperation | undefined>(
    (latest, op) => (latest && (latest.seq ?? 0) > (op.seq ?? 0) ? latest : op),
    undefined,
  );
}

/**
 * The profile to display.
 * @param rendered the fields the server rendered (possibly cached)
 * @param indexed a fresh index read: undefined until one has been made, null
 *   when the index has no profile
 */
export function projectProfile(
  rendered: ProfileFields,
  indexed: ProfileVersion | null | undefined,
  operations: ProfileOperation[],
): ProfileDisplay {
  const fromIndex = indexed === undefined ? rendered : indexed ? fieldsOf(indexed) : NO_PROFILE;
  const op = newest(operations);
  if (!op) return { fields: fromIndex, status: null };
  if (op.state === "submitting") return { fields: op.submitted, status: "saving" };
  if (op.state === "unknown") return { fields: op.submitted, status: "checking" };
  if (indexed?.cid === op.saved.cid) return { fields: fieldsOf(indexed), status: null };
  // Saved but not (or no longer) in the index: keep showing what was saved.
  return { fields: fieldsOf(op.saved), status: op.indexed ? null : "syncing" };
}

type SavedOperation = Extract<ProfileOperation, { state: "saved" }>;

/** An update to one stored operation. */
export type Change =
  | {
      seq: number;
      set:
        | { indexed: true }
        | { state: "unknown" }
        | Pick<SavedOperation, "state" | "saved" | "indexed">;
    }
  | { seq: number; remove: true; lost?: boolean };

/**
 * What a fresh index read settles: saved versions it shows are marked indexed,
 * and operations older than the newest saved one are dropped, since the
 * newest saved write (made with compare-and-swap) supersedes them.
 */
export function reconcileWithIndex(
  indexed: ProfileVersion | null,
  operations: ProfileOperation[],
): Change[] {
  const changes: Change[] = [];
  const saved = operations.filter((op) => op.state === "saved");
  const newestSaved = newest(saved);
  for (const op of operations) {
    if (op.seq === undefined) continue;
    if (newestSaved && op.seq < (newestSaved.seq ?? 0)) {
      changes.push({ seq: op.seq, remove: true });
    } else if (op.state === "saved" && !op.indexed && indexed?.cid === op.saved.cid) {
      changes.push({ seq: op.seq, set: { indexed: true } });
    }
  }
  return changes;
}

/**
 * Whether the newest operation can only be settled by reading the PDS: its
 * outcome is unknown, or the index once showed the saved version and now
 * shows another (a stale read, or a later write made elsewhere).
 */
export function needsPdsCheck(
  indexed: ProfileVersion | null | undefined,
  operations: ProfileOperation[],
): boolean {
  const op = newest(operations);
  if (!op) return false;
  if (op.state === "unknown") return true;
  return (
    op.state === "saved" && op.indexed && indexed !== undefined && indexed?.cid !== op.saved.cid
  );
}

/**
 * Settles the newest operation against the PDS's current version.
 * - Unknown outcome: saved if the PDS holds what was submitted, otherwise the
 *   save was lost and the operation is dropped (`lost`), never retried.
 * - Saved, index shows another version: if the PDS still holds the saved
 *   version the index is stale and the guard stays; otherwise the profile was
 *   changed elsewhere and the guard gives way to the index.
 */
export function resolveWithPds(
  pds: ProfileVersion | null,
  indexed: ProfileVersion | null | undefined,
  operations: ProfileOperation[],
): Change[] {
  const op = newest(operations);
  if (op?.seq === undefined) return [];
  if (op.state === "unknown") {
    const landed =
      pds?.displayName === op.submitted.displayName &&
      pds?.description === op.submitted.description;
    return landed && pds
      ? [{ seq: op.seq, set: { state: "saved", saved: pds, indexed: indexed?.cid === pds.cid } }]
      : [{ seq: op.seq, remove: true, lost: true }];
  }
  if (op.state === "saved" && pds?.cid !== op.saved.cid) return [{ seq: op.seq, remove: true }];
  return [];
}
