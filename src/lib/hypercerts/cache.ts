// Cache tags for public, indexed data, shared by the reads that tag it
// (./queries) and the actions that expire it. Their lifetime is the "public"
// cacheLife profile in next.config.ts.
export const tags = {
  /** Signed-in browser session read via `"use cache: private"` (`getUser()`). */
  session: () => "session",
  actor: (did: string) => `actor:${did}`,
  handle: (handle: string) => `handle:${handle.toLowerCase()}`,
  activities: (author: string) => `activities:${author}`,
  projects: (author: string) => `projects:${author}`,
  project: (uri: string) => `project:${uri}`,
  /** Explore's network-wide lists: activities, projects and accounts. */
  explore: () => "explore",
  /** Per-user CGS memberships cached privately for display. */
  memberships: (did: string) => `memberships:${did}`,
  /** Per-group CGS member list cached privately for display. */
  groupMembers: (did: string) => `group-members:${did}`,
  endorsements: (did: string) => `endorsements:${did}`,
  badges: (did: string) => `badges:${did}`,
  badge: (uri: string) => `badge:${uri}`,
  list: (uri: string) => `list:${uri}`,
  /** Receipts to, from or for this account or record. */
  funding: (subject: string) => `funding:${subject}`,
  follows: (did: string) => `follows:${did}`,
  /** The location records an account published (the location picker's "My locations"). */
  locations: (did: string) => `locations:${did}`,
  /** What others add to a record: evaluations, measurements, attachments. */
  context: (uri: string) => `context:${uri}`,
};
