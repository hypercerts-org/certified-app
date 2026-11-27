// Read queries against the Hypercerts API.
//
// Every page and route handler reads through these functions; nothing else
// talks to the API. Domain modules live under `./queries/` and call XRPC
// endpoints with `@atproto/lex` and `@hypercerts-org/api`. When the Hypercerts
// SDK ships its read layer, only the bodies of these modules need to change.
import "server-only";

export {
  didOfSegment,
  getActor,
  getActorCards,
  getActorCore,
  getActorPlace,
  getActorWithHandle,
  getIndexedProfile,
} from "./actors";
export {
  type AwardedBadge,
  type BadgeHolder,
  type BadgeHolders,
  type BadgeRecipient,
  type Badges,
  badgeAwardIndexed,
  badgeDefinitionIndexed,
  getAwardedBadges,
  getBadge,
  getBadges,
  getIndexedBadgeAwardResponse,
  getIssuedBadges,
  getProjectBadges,
  getRecordBadges,
  getRejectedBadges,
  getYourBadges,
  type IssuedBadge,
  listBadgeHolders,
  type ProjectBadge,
} from "./badges";
export {
  type AccountType,
  EXPLORE_PAGE,
  type ExploreItem,
  type ExploreSort,
  exploreAccounts,
  exploreActivities,
  exploreFeatured,
  exploreProjects,
  type FeaturedKind,
} from "./explore";
export {
  type FundingSummary,
  getFundingSummary,
  hasFunding,
  listReceiptsPage,
  type ReceiptFilter,
  type ReceiptRow,
} from "./funding";
export {
  getIndexedList,
  getIndexedListsByType,
  getList,
  getListItems,
  LIST_ITEMS_PAGE,
  type ListDetail,
  listLists,
  resolveListItems,
} from "./lists";
export { getPlace, listSavedPlaces, type SavedPlace } from "./locations";
export { getProfileFeed } from "./profile-feed";
export {
  type Endorsements,
  type FollowCounts,
  getActorLikesForSubjects,
  getEndorsement,
  getEndorsements,
  getEndorsers,
  getEntityFollow,
  getFollow,
  getFollowCounts,
  getIndexedActorLike,
  getIndexedEndorsement,
  getIndexedEndorsements,
  getIndexedEntityFollow,
  getIndexedFollow,
  getLikeCounts,
  getProjectFollowers,
  listEndorsements,
  listFollows,
  listProjectsFollowed,
  type PeoplePage,
  type ProjectFollowRow,
} from "./social";
export {
  type EvaluationWithEvaluators,
  getTimeline,
  type TimelineItem,
  type TimelineOn,
} from "./timeline";
export {
  type ActivityDetail,
  activityIndexed,
  type Count,
  getActivity,
  getActivityRecord,
  getNetworkCounts,
  getProjectRecord,
  getProjectsWith,
  getRecordCounts,
  getWork,
  listActivitiesPage,
  listLatestRecords,
  listProjectActivitiesPage,
  listProjectsPage,
  type NetworkCounts,
  projectIndexed,
  type RecordCounts,
  type Work,
} from "./work";
