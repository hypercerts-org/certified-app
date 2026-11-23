// Waiting for the Hypercerts API's index to show a write. Writes go to a PDS
// and reach the index a moment later (it should take a second or two); an
// action waits for that, then expires the cached pages the write changes, so
// every page shows it from the server, the one source of what is indexed.
// Each caller checks for its own record, as the API can't say which repository
// revision it has indexed (TECH-938); with that, one generic check would do.
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
