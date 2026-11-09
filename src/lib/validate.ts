// Input validation for public query parameters. Route handlers and embeds
// accept only bounded, well-formed values; nothing is passed upstream raw.
import type { l } from "@atproto/lex";

export function isDid(value: string): value is l.DidString {
  return /^did:(plc|web):[a-zA-Z0-9._:%-]{1,200}$/.test(value);
}

export function isAtUri(value: string): boolean {
  return /^at:\/\/did:(plc|web):[a-zA-Z0-9._:%-]+\/[a-zA-Z0-9.]+\/[a-zA-Z0-9._:~-]{1,512}$/.test(
    value,
  );
}

export function cursorParam(value: string | null): string | undefined {
  return value && value.length <= 512 ? value : undefined;
}

/**
 * A path on this site to return to after sign-in, or "/". Rejects anything a
 * browser could resolve to another origin (`//host`, `/\host`, schemes).
 */
export function returnPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 512) return "/";
  return /^\/(?![/\\])[^\s\\]*$/.test(value) ? value : "/";
}
