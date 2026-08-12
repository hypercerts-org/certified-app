/**
 * Compatibility shim. The canonical AT-URI parsing + in-app URL building
 * now lives in `src/lib/urls.ts` (handle-forward scheme). This module
 * re-exports the historical names so existing call sites keep working;
 * prefer importing from `@/lib/urls` in new code.
 */
import {
  parseAtUri as parseAtUriImpl,
  recordUrl,
  type ParsedAtUri,
} from "@/lib/urls"

export type ParsedActivityUri = ParsedAtUri

/** Parse any at:// URI into its components. Returns null if malformed. */
export const parseAtUri = parseAtUriImpl

/** Parse an at:// URI into its components. Returns null if malformed. */
export function parseActivityUri(uri: string): ParsedActivityUri | null {
  return parseAtUriImpl(uri)
}

/**
 * Build the in-app detail URL for an activity record. Now emits the
 * handle-forward scheme's DID form (`/{did}/activity/{rkey}`); opening it
 * canonicalizes to the handle. `did` may also be a handle for the pretty form.
 */
export function activityDetailHref(did: string, rkey: string): string {
  return recordUrl(did, "activity", rkey)
}
