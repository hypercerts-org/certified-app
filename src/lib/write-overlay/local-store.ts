// Writes made in this browser, kept in IndexedDB so a reload shows them until
// the Hypercerts API's index catches up: saves the PDS has confirmed, and
// follows and unfollows (shown from the click on). Only public record content
// is stored.
import { Dexie, type EntityTable, type Table } from "dexie";
import type { FollowRef } from "@/lib/hypercerts/views";

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

/** This browser's last follow or unfollow of `subject` by `actor`. */
export type FollowSave = {
  actor: string;
  subject: string;
  following: boolean;
  /** The follow record made (null until the PDS answers, and for an unfollow). */
  follow: FollowRef | null;
  /** The follow records an unfollow deletes: the index showing one is lag. */
  removed: string[];
  savedAt: number;
};

/** Index lag is seconds; a follow save this old is forgotten, whatever the index says. */
const FOLLOW_SAVE_TTL = 60 * 60 * 1000;

class WriteStore extends Dexie {
  saved!: EntityTable<SavedRecord, "uri">;
  follows!: Table<FollowSave, [string, string]>;

  constructor() {
    super("certified-writes");
    this.version(1).stores({ saved: "uri" });
    this.version(2).stores({ saved: "uri", follows: "[actor+subject], subject" });
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

/**
 * The index has caught up with a follow once it shows a follow, and with an
 * unfollow once it shows none, or one the unfollow didn't delete (made since,
 * elsewhere).
 */
export function followCaughtUp(indexed: FollowRef | null, save: FollowSave): boolean {
  if (save.following) return indexed !== null;
  return indexed === null || !save.removed.includes(indexed.uri);
}

const fresh = (save: FollowSave | undefined) =>
  save && Date.now() - save.savedAt < FOLLOW_SAVE_TTL ? save : undefined;

export async function getFollowSave(actor: string, subject: string) {
  return fresh(await db().follows.get([actor, subject]));
}

/** The follows and unfollows of `subject` the index may not show yet. */
export async function getFollowSavesOf(subject: string): Promise<FollowSave[]> {
  const saves = await db().follows.where("subject").equals(subject).toArray();
  return saves.filter((save) => fresh(save));
}

export async function putFollowSave(save: FollowSave): Promise<void> {
  await db().follows.put(save);
}

/** Puts back what was there before a follow or unfollow that failed. */
export async function restoreFollowSave(
  actor: string,
  subject: string,
  previous: FollowSave | undefined,
): Promise<void> {
  if (previous) await db().follows.put(previous);
  else await db().follows.delete([actor, subject]);
}

/** Forgets the follow save made at `savedAt`, unless a newer one replaced it. */
export function forgetFollowSave(actor: string, subject: string, savedAt: number) {
  return db()
    .follows.where("[actor+subject]")
    .equals([actor, subject])
    .filter((save) => save.savedAt === savedAt)
    .delete();
}

/** Forgets every save, so the next person on this browser sees none. */
export async function clearWriteStore(): Promise<void> {
  await Promise.all([db().saved.clear(), db().follows.clear()]);
}
