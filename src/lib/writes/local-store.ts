// The browser's record of its own writes, kept in IndexedDB so a save survives
// a reload while the Hypercerts API's index catches up with the PDS.
//
// The PDS stays authoritative; this is a temporary presentation and recovery
// layer. It holds only what display and recovery need (never credentials) and
// is untrusted input to the server. IndexedDB is per origin, so rows are
// isolated per deployment; within it they are scoped by account.
import { Dexie, type EntityTable } from "dexie";
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";

type OperationBase = {
  /** Local order of operations: the newest one wins. */
  seq?: number;
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
 * submitting: sent, no answer yet (found after a reload: never answered).
 * unknown: the answer was lost; the PDS must be read to find out.
 * saved: the PDS stored `saved`. `indexed` records that the index has shown
 * it at least once; the row then stays as a guard against a later stale read.
 */
export type ProfileOperation = OperationBase &
  (
    | { state: "submitting" }
    | { state: "unknown" }
    | { state: "saved"; saved: ProfileVersion; indexed: boolean }
  );

class WriteStore extends Dexie {
  profileOperations!: EntityTable<ProfileOperation, "seq">;

  constructor() {
    super("certified-writes");
    this.version(1).stores({ profileOperations: "++seq, &id, repoDid" });
  }
}

let store: WriteStore | undefined;

/** The store, opened on first use in the browser. */
export function writeStore(): WriteStore {
  store ??= new WriteStore();
  return store;
}

/** Forgets every local write, so the next person on this browser sees none. */
export async function clearWriteStore(): Promise<void> {
  await writeStore().profileOperations.clear();
}
