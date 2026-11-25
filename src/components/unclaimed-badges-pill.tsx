import { unstable_rethrow } from "next/navigation";
import { getBadges } from "@/lib/hypercerts/queries";
import { logError } from "@/lib/log";

/**
 * Red notification pill showing unclaimed badge awards awaiting response.
 * Streamed inside its own <Suspense fallback={null}> so Workspace nav links
 * render immediately without waiting on badge pagination.
 */
export async function UnclaimedBadgesPill({ did }: { did: string }) {
  let count = 0;
  try {
    count = (await getBadges(did)).awaiting.length;
  } catch (err) {
    unstable_rethrow(err);
    logError("[badges] unclaimed nav count failed", err, { did });
    return null;
  }
  if (count <= 0) return null;
  return (
    <>
      <span className="nav-badge" aria-hidden>
        {count > 99 ? "99+" : count}
      </span>
      <span className="visually-hidden">
        {" "}
        ({count} unclaimed {count === 1 ? "badge" : "badges"})
      </span>
    </>
  );
}
