// Saves the PDS has confirmed, kept in IndexedDB so a reload shows them until
// the Hypercerts API's index catches up. Only public record content is stored.
import { Dexie, type EntityTable } from "dexie";

export type SavedRecord<T = unknown> = {
  /** The record's AT-URI. */
  uri: string;
  /** The version the PDS stored. */
  cid: string;
  /** Versions this browser's saves replaced since the index last caught up
   *  (null: the record was created). The index showing one of them is lag. */
  replaced: (string | null)[];
  /** When the save was recorded: older index reads say nothing about it. */
  savedAt: number;
  value: T;
};

class WriteStore extends Dexie {
  saved!: EntityTable<SavedRecord, "uri">;

  constructor() {
    super("certified-writes");
    this.version(1).stores({ saved: "uri" });
  }
}

let store: WriteStore | undefined;
const db = () => (store ??= new WriteStore());

/**
 * The index has caught up once it shows the save, or a version none of the
 * saves replaced: a later change (saves are compare-and-swap, so any other
 * version came after them).
 */
export function indexCaughtUp(indexedCid: string | null, save: SavedRecord): boolean {
  return indexedCid === save.cid || !save.replaced.includes(indexedCid);
}

export function getSave<T>(uri: string): Promise<SavedRecord<T> | undefined> {
  return db().saved.get(uri) as Promise<SavedRecord<T> | undefined>;
}

/** Records a save that replaced version `expectedCid`, on top of any earlier
 *  save of the record the index hasn't caught up with. */
export async function putSave<T>(
  save: Omit<SavedRecord<T>, "replaced" | "savedAt">,
  expectedCid: string | null,
): Promise<void> {
  const table = db().saved;
  await db().transaction("rw", table, async () => {
    const earlier = await table.get(save.uri);
    const replaced = [...(earlier ? [...earlier.replaced, earlier.cid] : []), expectedCid];
    await table.put({ ...save, replaced: [...new Set(replaced)], savedAt: Date.now() });
  });
}

/** Forgets save `cid` of a record, unless a newer save has replaced it.
 *  Returns how many rows were deleted (0 or 1). */
export function forgetSave(uri: string, cid: string): Promise<number> {
  return db()
    .saved.where("uri")
    .equals(uri)
    .filter((save) => save.cid === cid)
    .delete();
}

/** Forgets every save, so the next person on this browser sees none. */
export async function clearWriteStore(): Promise<void> {
  await db().saved.clear();
}
