// Parsing and resolving user-pasted references to accounts and records:
// handles (@alice.bsky.social), DIDs (did:plc:...), AT-URIs (at://...), and
// Certified URLs (https://certified.app/{actor}, /{actor}/project/{rkey},
// /{actor}/activity/{rkey}). Shared by badge awarding, workspace endorsements,
// list item adding, and group member management.
import "server-only";

import { getDid } from "@/lib/identity";
import { isAtUri, isDid, isRkey } from "@/lib/validate";

const HANDLE =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const PATH_COLLECTIONS: Record<string, string> = {
  project: "org.hypercerts.collection",
  activity: "org.hypercerts.claim.activity",
  badge: "app.certified.badge.definition",
  lists: "org.hypercerts.collection",
};

/** Non-actor top-level routes on Certified, never treated as a handle. */
const RESERVED_SEGMENTS = new Set([
  "api",
  "apps",
  "explore",
  "oauth",
  "settings",
  "sign-in",
  "welcome",
  "workspace",
]);

export type ParsedTarget =
  | { kind: "did"; did: string }
  | { kind: "handle"; handle: string }
  | { kind: "uri"; uri: string }
  | { kind: "record-path"; actor: string; collection: string; rkey: string };

/**
 * Parses a single pasted line or field value without making network calls.
 * Returns null when the text doesn't look like a DID, handle, AT-URI, or URL.
 */
export function parseTarget(raw: string): ParsedTarget | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 1024) return null;

  if (trimmed.startsWith("at://")) {
    return isAtUri(trimmed) ? { kind: "uri", uri: trimmed } : null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    let segments: string[];
    try {
      segments = url.pathname
        .split("/")
        .filter(Boolean)
        .map((s) => decodeURIComponent(s));
    } catch {
      return null;
    }
    if (segments.length === 0) return null;
    const [first, second, third] = segments;
    if (RESERVED_SEGMENTS.has(first.toLowerCase())) return null;
    const actor = first.replace(/^@/, "");
    if (!isDid(actor) && !HANDLE.test(actor)) return null;

    if (second && third && PATH_COLLECTIONS[second] && isRkey(third)) {
      return {
        kind: "record-path",
        actor,
        collection: PATH_COLLECTIONS[second],
        rkey: third,
      };
    }
    return isDid(actor) ? { kind: "did", did: actor } : { kind: "handle", handle: actor };
  }

  const stripped = trimmed.replace(/^@/, "");
  if (isDid(stripped)) return { kind: "did", did: stripped };
  if (HANDLE.test(stripped)) return { kind: "handle", handle: stripped };
  return null;
}

/** Resolves a handle, DID, or Certified profile URL to a DID; null when unresolved or a record. */
export async function resolveAccountDid(raw: string): Promise<string | null> {
  const parsed = parseTarget(raw);
  if (!parsed) return null;
  if (parsed.kind === "did") return parsed.did;
  if (parsed.kind === "handle") return getDid(parsed.handle);
  return null;
}

/**
 * Resolves a handle, DID, Certified URL, or AT-URI to a badge award subject
 * (`{ did }` for an account or `{ uri }` for a record); null when unresolved.
 */
export async function resolveAwardSubject(
  raw: string,
): Promise<{ did: string } | { uri: string } | null> {
  const parsed = parseTarget(raw);
  if (!parsed) return null;
  if (parsed.kind === "did") return { did: parsed.did };
  if (parsed.kind === "handle") {
    const did = await getDid(parsed.handle);
    return did ? { did } : null;
  }
  if (parsed.kind === "uri") return { uri: parsed.uri };
  const did = isDid(parsed.actor) ? parsed.actor : await getDid(parsed.actor);
  if (!did) return null;
  return { uri: `at://${did}/${parsed.collection}/${parsed.rkey}` };
}
