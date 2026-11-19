import "server-only";

import { cacheLife } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getPdsUrl, safeFetch } from "@/lib/identity";
import { logError } from "@/lib/log";

// Small text a record keeps in a blob instead of inline: a location record's
// coordinates, for one ("org.hypercerts.defs#smallBlob"). Read from the
// account's own server (com.atproto.sync.getBlob), through a fetch that
// refuses private addresses, capped in size and time.

/** More than any location needs: a GeoJSON point is under 100 bytes. */
const MAX_BYTES = 4_096;
const TIMEOUT_MS = 4_000;

/** A blob's text, cached for good: a blob never changes under its CID. */
async function fetchBlobText(did: string, cid: string): Promise<string> {
  "use cache";
  cacheLife("max");
  const url = new URL("/xrpc/com.atproto.sync.getBlob", await getPdsUrl(did));
  url.search = new URLSearchParams({ did, cid }).toString();
  const response = await safeFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`getBlob answered ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error(`blob of ${length} bytes is too large`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error("blob is too large");
  return text;
}

/** A small blob's text, or null if it can't be read now (not cached: retried). */
export async function getBlobText(did: string, cid: string): Promise<string | null> {
  try {
    return await fetchBlobText(did, cid);
  } catch (err) {
    unstable_rethrow(err); // Next's own signals (prerendering) pass through
    logError("[blobs] read failed", err, { did, cid });
    return null;
  }
}
