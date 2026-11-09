// Cache tags for public, indexed data, shared by the reads that tag it
// (./queries) and the actions that expire it. Their lifetime is the "public"
// cacheLife profile in next.config.ts.
export const tags = {
  actor: (did: string) => `actor:${did}`,
  activities: (author?: string) => (author ? `activities:${author}` : "activities"),
  projects: (author: string) => `projects:${author}`,
  project: (uri: string) => `project:${uri}`,
  organizations: () => "organizations",
  badges: (did: string) => `badges:${did}`,
  awardsIssued: (did: string) => `awards-issued:${did}`,
};
