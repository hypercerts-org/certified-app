// Cache tags for public, indexed data, shared by the reads that tag it
// (./queries) and the actions that expire it. Their lifetime is the "public"
// cacheLife profile in next.config.ts.
export const tags = {
  actor: (did: string) => `actor:${did}`,
  activities: (author: string) => `activities:${author}`,
  projects: (author: string) => `projects:${author}`,
  project: (uri: string) => `project:${uri}`,
  organizations: () => "organizations",
  /** Explore's network-wide lists: activities, projects and accounts. */
  explore: () => "explore",
  endorsements: (did: string) => `endorsements:${did}`,
  badges: (did: string) => `badges:${did}`,
  badge: (uri: string) => `badge:${uri}`,
  list: (uri: string) => `list:${uri}`,
  /** Receipts to, from or for this account or record. */
  funding: (subject: string) => `funding:${subject}`,
  follows: (did: string) => `follows:${did}`,
  /** What others add to a record: evaluations, measurements, attachments. */
  context: (uri: string) => `context:${uri}`,
};
