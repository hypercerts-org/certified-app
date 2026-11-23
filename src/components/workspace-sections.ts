import {
  Award,
  FolderGit2,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  ThumbsUp,
  Users,
} from "lucide-react";

/**
 * A workspace's sections, in order: one list for every navigation that shows
 * them (the app sidebar, the workspace's own nav). `path` is under the
 * workspace's address ("" for the Overview).
 */
export const WORKSPACE_SECTIONS: readonly { label: string; icon: LucideIcon; path: string }[] = [
  { label: "Overview", icon: LayoutDashboard, path: "" },
  { label: "Projects and activities", icon: FolderGit2, path: "/projects" },
  { label: "Endorsements", icon: ThumbsUp, path: "/endorsements" },
  { label: "Followers", icon: Users, path: "/followers" },
  { label: "Badges", icon: Award, path: "/badges" },
  { label: "Lists", icon: ListChecks, path: "/lists" },
];
