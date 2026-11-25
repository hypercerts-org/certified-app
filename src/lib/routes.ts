// Pure URL builders and workspace path matchers shared by Server Actions
// (src/lib/*) and UI components (src/components/*), keeping src/lib free of
// UI imports.

/** An account's workspace. */
export function workspaceHref(did: string) {
  return `/${did}/workspace`;
}

/** `/workspace`, and any account's workspace or profile editor; group 1 is the DID. */
export const WORKSPACE_PATH = /^\/(?:workspace|(did:[^/]+)\/(?:workspace|edit))(?:\/|$)/;

/** A workspace's Overview (or the profile editor, opened from it). */
export const WORKSPACE_OVERVIEW_PATH = /^\/(?:workspace|did:[^/]+\/(?:workspace|edit))\/?$/;

/** The section of a workspace a path is in ("/projects"), or "" for the Overview. */
export function workspaceSection(pathname: string): string {
  return pathname.match(/^\/did:[^/]+\/workspace(\/[^/]+)/)?.[1] ?? "";
}

/** A project's page: /{author}/project/{rkey}. */
export function projectHref(project: { authorDid: string; rkey: string }) {
  return `/${project.authorDid}/project/${project.rkey}`;
}

/** An activity's page: /{author}/activity/{rkey}. */
export function activityHref(uri: string) {
  const [, , did, , rkey] = uri.split("/");
  return `/${did}/activity/${rkey}`;
}

/** A badge's page, under the account that defined it: /{issuer}/badge/{rkey}. */
export function badgeHref(badge: { ownerDid: string; rkey: string }) {
  return `/${badge.ownerDid}/badge/${badge.rkey}`;
}
