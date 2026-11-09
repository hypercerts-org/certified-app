// What to show for a profile while the index catches up with saved writes,
// and how index and PDS reads settle the local operations. Pure functions over
// plain values: ./use-profile only wires them to IndexedDB and TanStack Query.
//
// Precedence follows the write-consistency handoff: the newest local operation
// wins over indexed data until the index shows the exact version (CID) that
// was saved. CIDs identify versions, not their order, so they are only ever
// compared for equality, and only on raw index and PDS responses.
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";
import type { ProfileOperation } from "./local-store";

/** saving: sent, no answer yet. checking: outcome unknown, reading the PDS.
 *  syncing: saved, the index hasn't shown it yet. */
export type ProfileStatus = "saving" | "checking" | "syncing" | null;

export type ProfileDisplay = {
  fields: ProfileFields;
  status: ProfileStatus;
  /** The newest save never reached the PDS; the user should make it again. */
  lost: boolean;
  /** The version the newest successful save stored: what a next edit is based on. */
  savedCid: string | undefined;
};

/** How often the PDS is read before an unanswered save counts as lost. */
export const UNKNOWN_CHECKS = 3;

const NO_PROFILE: ProfileFields = { displayName: "", description: "" };

const fieldsOf = ({ displayName, description }: ProfileFields): ProfileFields => ({
  displayName,
  description,
});

const sameFields = (a: ProfileFields, b: ProfileFields) =>
  a.displayName === b.displayName && a.description === b.description;

function newest(operations: ProfileOperation[]): ProfileOperation | undefined {
  return operations.reduce<ProfileOperation | undefined>(
    (latest, op) => (latest && latest.seq > op.seq ? latest : op),
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
  const newestSaved = newest(operations.filter((op) => op.state === "saved"));
  const savedCid = newestSaved?.state === "saved" ? newestSaved.saved.cid : undefined;
  const base: ProfileDisplay = { fields: fromIndex, status: null, lost: false, savedCid };
  const op = newest(operations);
  switch (op?.state) {
    case undefined:
      return base;
    case "lost":
      return { ...base, lost: true };
    case "submitting":
      return { ...base, fields: op.submitted, status: "saving" };
    case "unknown":
      return { ...base, fields: op.submitted, status: "checking" };
    case "saved": {
      if (indexed?.cid === op.saved.cid) return { ...base, fields: fieldsOf(indexed) };
      // Saved but not (or no longer) in the index: keep showing what was saved.
      return { ...base, fields: fieldsOf(op.saved), status: op.indexed ? null : "syncing" };
    }
  }
}

/** A stored operation's new value, or its removal. */
export type Change = { seq: number; next: ProfileOperation } | { seq: number; remove: true };

/**
 * What a fresh index read settles: a saved version it shows is marked indexed,
 * and operations older than the newest saved one are dropped, since a later
 * save made with compare-and-swap supersedes them. (A newer lost save doesn't:
 * the saved version is still what the next edit is based on.)
 */
export function reconcileWithIndex(
  indexed: ProfileVersion | null,
  operations: ProfileOperation[],
): Change[] {
  const settled = newest(operations.filter((op) => op.state === "saved"));
  return operations.flatMap((op): Change[] => {
    if (settled && op.seq < settled.seq) return [{ seq: op.seq, remove: true }];
    if (op.state === "saved" && !op.indexed && indexed?.cid === op.saved.cid) {
      return [{ seq: op.seq, next: { ...op, indexed: true } }];
    }
    return [];
  });
}

/** A reason to read the PDS: which operation it concerns, and a query key. */
export type PdsQuestion = { opId: string; key: string };

/**
 * Whether, and about which operation, the PDS must be read; null when not.
 * - The newest save's outcome is unknown.
 * - The index shows a version that is neither the saved one nor (before it
 *   was ever indexed) the one the save replaced: a stale read, or a change
 *   made elsewhere.
 */
export function pdsQuestion(
  indexed: ProfileVersion | null | undefined,
  operations: ProfileOperation[],
): PdsQuestion | null {
  const op = newest(operations);
  if (op?.state === "unknown") return { opId: op.id, key: `unknown:${op.id}` };
  if (op?.state !== "saved" || indexed === undefined) return null;
  const shown = indexed?.cid ?? null;
  if (shown === op.saved.cid || (!op.indexed && shown === op.expectedCid)) return null;
  return { opId: op.id, key: `superseded:${op.id}:${shown}` };
}

/**
 * Settles operation `opId` against the PDS's current version, if it is still
 * the newest one (a save made since then has its own question).
 * - Unknown outcome. Compare-and-swap is the evidence: if the PDS still holds
 *   the version the save was based on, it hasn't been applied (re-read a few
 *   times, then lost; never retried). If it holds another version with the
 *   submitted fields, the save landed; otherwise the profile changed
 *   elsewhere and the save is lost.
 * - Saved: if the PDS still holds the saved version the index is stale and the
 *   row stays; otherwise the profile was changed elsewhere and the index wins.
 */
export function resolveWithPds(
  pds: ProfileVersion | null,
  operations: ProfileOperation[],
  opId: string,
): Change[] {
  const op = newest(operations);
  if (op?.id !== opId) return [];
  if (op.state === "unknown") {
    if ((pds?.cid ?? null) === op.expectedCid) {
      return op.checks + 1 < UNKNOWN_CHECKS
        ? [{ seq: op.seq, next: { ...op, checks: op.checks + 1 } }]
        : [{ seq: op.seq, next: { ...op, state: "lost" } }];
    }
    return pds && sameFields(pds, op.submitted)
      ? [{ seq: op.seq, next: { ...op, state: "saved", saved: pds, indexed: false } }]
      : [{ seq: op.seq, next: { ...op, state: "lost" } }];
  }
  if (op.state === "saved" && pds?.cid !== op.saved.cid) return [{ seq: op.seq, remove: true }];
  return [];
}

/**
 * Settles the newest saved operation against a PDS read made when the page
 * was rendered: if the PDS holds another version, the profile changed after
 * that save (saves are compare-and-swap), so the row is outdated and the
 * page's version is the one to edit.
 */
export function settleWithPageRead(
  pds: ProfileVersion | null,
  operations: ProfileOperation[],
): Change[] {
  const op = newest(operations);
  return op?.state === "saved" && pds?.cid !== op.saved.cid ? [{ seq: op.seq, remove: true }] : [];
}

/** Operations whose outcome or indexing is still open: worth polling the index. */
export function isPending(op: ProfileOperation): boolean {
  return (
    op.state === "submitting" || op.state === "unknown" || (op.state === "saved" && !op.indexed)
  );
}
