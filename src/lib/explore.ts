import "server-only";

import type { ExploreKind, ExploreState } from "@/lib/explore-state";
import {
  EXPLORE_PAGE,
  exploreAccounts,
  exploreActivities,
  exploreFeatured,
  exploreProjects,
} from "@/lib/hypercerts/queries";

export { exploreFrom } from "@/lib/explore-state";

/**
 * A page of one of Explore's lists. Featured pages by position (its cursor is
 * an offset); a search leaves Featured for the whole network.
 */
export function explorePage(kind: ExploreKind, state: ExploreState, cursor?: string) {
  if (state.featured && !state.query) {
    const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
    return exploreFeatured(kind, offset, EXPLORE_PAGE, state.sort);
  }
  const options = {
    query: state.query || undefined,
    sort: state.sort,
    cursor,
    limit: EXPLORE_PAGE,
  };
  if (kind === "activities") return exploreActivities(options);
  if (kind === "projects") return exploreProjects(options);
  return exploreAccounts({ ...options, type: state.type });
}
