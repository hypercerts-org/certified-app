// Waiting for the Hypercerts API's index to show a write. Writes go to a PDS
// and reach the index a moment later (it should take a second or two); an
// action waits for that, then expires the cached pages the write changes, so
// every page shows it from the server, the one source of what is indexed.
// Each caller checks for its own record. One generic check would need the
// index to report which repository revision it has reached (as Bluesky's
// AppView does), an upstream change to HappyView that was judged not worth it
// (TECH-938, canceled): a per-record check is simple and reliable.
import "server-only";

/** How long an action waits for the index before giving up. */
const TIMEOUT_MS = 3_000;

/**
 * Resolves true once `indexed` answers true, or false after the timeout (the
 * pages then catch up as their cache refreshes). A failing check counts as
 * not yet.
 */
export async function waitForIndex(indexed: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + TIMEOUT_MS;
  for (let delay = 150; ; delay = Math.min(delay * 2, 800)) {
    if (await indexed().catch(() => false)) return true;
    if (Date.now() + delay > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
