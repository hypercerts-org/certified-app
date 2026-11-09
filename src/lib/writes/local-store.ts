// The browser's record of its own writes, kept in IndexedDB so a save survives
// a reload while the Hypercerts API's index catches up with the PDS.
//
// The PDS stays authoritative; this is a temporary presentation and recovery
// layer. It holds only what display and recovery need (never credentials) and
// is untrusted input to the server. IndexedDB is per origin, so rows are
// isolated per deployment; within it every read is scoped to the signed-in
// account and the repository written.
import { Dexie, type EntityTable } from "dexie";
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";

type OperationBase = {
  /** Local order of operations: the newest one wins. */
  seq: number;
  /** Correlates the intent, the acknowledgement and any recovery. */
  id: string;
  /** The signed-in account that wrote, and the repository written. */
  actorDid: string;
  repoDid: string;
  submitted: ProfileFields;
  /** The version the edit was based on, for compare-and-swap. */
  expectedCid: string | null;
};

/**
 * submitting: sent, no answer yet (found later with no save running: never
 *   answered, so unknown).
 * unknown: the answer was lost; the PDS is read to find out (`checks` so far).
 * saved: the PDS stored `saved`. `indexed` records that the index has shown it
 *   at least once; the row then stays as a guard against a later stale read.
 * lost: the PDS never stored it; kept to tell the user until the next save.
 */
export type ProfileOperation = OperationBase &
  (
    | { state: "submitting" }
    | { state: "unknown"; checks: number }
    | { state: "saved"; saved: ProfileVersion; indexed: boolean }
    | { state: "lost" }
  );

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewProfileOperation = DistributiveOmit<ProfileOperation, "seq">;

class WriteStore extends Dexie {
  profileOperations!: EntityTable<ProfileOperation, "seq", NewProfileOperation>;

  constructor() {
    super("certified-writes");
    this.version(1).stores({ profileOperations: "++seq, [actorDid+repoDid]" });
  }
}

let store: WriteStore | undefined;

/** The store, opened on first use in the browser. */
export function writeStore(): WriteStore {
  store ??= new WriteStore();
  return store;
}

/** The signed-in account's operations on one repository. */
export function operationsFor(actorDid: string, repoDid: string): Promise<ProfileOperation[]> {
  return writeStore()
    .profileOperations.where("[actorDid+repoDid]")
    .equals([actorDid, repoDid])
    .toArray();
}

/** Forgets every local write, so the next person on this browser sees none. */
export async function clearWriteStore(): Promise<void> {
  await writeStore().profileOperations.clear();
}
