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
