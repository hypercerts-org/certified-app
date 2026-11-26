// The kinds of list there are (by the collection's type: list:certs,
// list:projects, list:accounts, list:endorsements), in the order every page
// shows them: the profile's and the workspace's Lists, and New list.

export type ListKind = {
  /** Its group's heading, and ListCard.kind of its lists. */
  label: "Activities" | "Projects" | "Accounts" | "Endorsements";
  /** One of its items: "activity", for Add items' wording. */
  noun: string;
};

export const LIST_KINDS: readonly ListKind[] = [
  { label: "Activities", noun: "activity" },
  { label: "Projects", noun: "project" },
  { label: "Accounts", noun: "account" },
  { label: "Endorsements", noun: "endorsement" },
];

/** The record collection each list type holds, and for projects the collection's own type. */
const HOLDS: Record<string, { collections: string[]; type?: string }> = {
  "list:certs": { collections: ["org.hypercerts.claim.activity"] },
  "list:projects": { collections: ["org.hypercerts.collection"], type: "project" },
  "list:accounts": { collections: ["app.certified.actor.profile", "app.bsky.actor.profile"] },
  "list:endorsements": { collections: ["app.certified.badge.award"] },
};

/**
 * Whether record `uri` (with its `value`) belongs in a list of type
 * `listType`: an activity in an activities list, a project (not another
 * list) in a projects list, and so on. A type this app doesn't know takes
 * anything.
 */
export function fitsList(listType: unknown, uri: string, value: unknown): boolean {
  const holds = typeof listType === "string" ? HOLDS[listType] : undefined;
  if (!holds) return true;
  const collection = uri.split("/")[3];
  if (!holds.collections.includes(collection)) return false;
  return holds.type === undefined || (value as { type?: unknown } | null)?.type === holds.type;
}
