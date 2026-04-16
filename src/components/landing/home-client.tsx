"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { useOrgProfile } from "@/hooks/use-org-profile";
import { useOrg } from "@/lib/groups/org-context";
import { useSession } from "@/hooks/use-session";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import Button from "@/components/ui/button";

export default function HomeClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const urlDid = typeof params?.did === "string" ? decodeURIComponent(params.did) : null;
  const { isLoading, isAuthenticated, did } = useAuth();
  const { profile, avatarUrl, bannerUrl, isFallback } = useProfile();
  const { activeOrg, groups, isLoading: orgsLoading, switchOrg } = useOrg();
  const { orgProfile, orgMetadata, orgAvatarUrl, orgBannerUrl } = useOrgProfile();
  const { handle } = useSession();

  // Redirect to /welcome if not authenticated (handles expired sessions, sign-out)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/welcome");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable, omitting to prevent re-renders
  }, [isLoading, isAuthenticated]);

  // Canonicalize URL: `/` → `/profile/{did}` (of user or active org)
  useEffect(() => {
    if (isLoading || !isAuthenticated || !did) return;
    if (pathname !== "/") return;
    const targetDid = activeOrg?.groupDid || did;
    router.replace(`/profile/${encodeURIComponent(targetDid)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable
  }, [isLoading, isAuthenticated, did, pathname, activeOrg?.groupDid]);

  // Sync active org with URL DID when on `/profile/[did]`
  useEffect(() => {
    if (isLoading || orgsLoading || !isAuthenticated || !did || !urlDid) return;

    if (urlDid === did) {
      if (activeOrg !== null) switchOrg(null);
      return;
    }

    const matchingGroup = groups.find((g) => g.groupDid === urlDid);
    if (matchingGroup) {
      if (activeOrg?.groupDid !== matchingGroup.groupDid) switchOrg(matchingGroup);
      return;
    }

    // URL DID doesn't match user or any of their groups — redirect to self.
    const selfDid = activeOrg?.groupDid || did;
    if (urlDid !== selfDid) {
      router.replace(`/profile/${encodeURIComponent(selfDid)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable
  }, [isLoading, orgsLoading, isAuthenticated, did, urlDid, groups, activeOrg?.groupDid]);

  const initials = getInitials(profile?.displayName, did);

  // Show loading screen while loading, or while on `/` (redirecting to /profile/{did})
  if (isLoading || (isAuthenticated && pathname === "/")) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__inner">
          <img
            src="/assets/certified_brandmark_black.svg"
            alt=""
            aria-hidden="true"
            className="loading-screen__logo"
          />
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    // When acting as a group, show the org profile
    const isOrgMode = !!activeOrg;
    const displayProfile = isOrgMode ? orgProfile : profile;
    const displayAvatar = isOrgMode ? (orgAvatarUrl || undefined) : (avatarUrl || undefined);
    const displayBanner = isOrgMode ? orgBannerUrl : bannerUrl;
    const displayInitials = isOrgMode
      ? (activeOrg.displayName || activeOrg.handle || "O").slice(0, 2).toUpperCase()
      : initials;
    const displayHandle = isOrgMode ? activeOrg.handle : handle;
    const displayDid = isOrgMode ? activeOrg.groupDid : did;
    const editHref = isOrgMode
      ? `/groups/${encodeURIComponent(activeOrg.groupDid)}/edit-profile`
      : "/settings/edit-profile";

    return (
      <div className="dashboard">
        {/* Top bar */}
        <div className="dashboard__topbar">
          <h1 className="dashboard__page-title">Profile</h1>
        </div>

        {/* Main content area */}
        <div className="dashboard__body">
          <div className="dashboard__main">
            {/* Profile header card */}
            <div className="dash-card">
              <div className="profile-card__banner">
                {displayBanner ? (
                  <img src={displayBanner} alt="" />
                ) : null}
              </div>
              <div className="profile-card">
                <Avatar size="lg" src={displayAvatar} fallbackInitials={displayInitials} bordered />
                <div className="profile-card__info">
                  <h2 className="profile-card__name">{displayProfile?.displayName || (isOrgMode ? activeOrg.displayName : "Anonymous")}</h2>
                  <p className="profile-card__handle">@{displayHandle}</p>
                </div>
                <Link href={editHref}>
                  <Button variant="ghost" size="sm">
                    <Pencil size={14} />
                    Edit
                  </Button>
                </Link>
              </div>
              <dl className="profile-card__did">
                <dt className="personal-info__label">Identifier</dt>
                <dd className="personal-info__field personal-info__field--mono">{displayDid}</dd>
                <dd className="personal-info__hint">
                  {isOrgMode
                    ? "The group's decentralized identifier (DID) — this never changes, even if you update the handle."
                    : "Your stable decentralized identifier (DID) — this never changes, even if you update your username."}
                </dd>
              </dl>
            </div>

            {/* Account Details card */}
            <div className="dash-card">
              <h2 className="dash-card__title">
                {isOrgMode ? "Group Details" : "Account Details"}
              </h2>
              {!isOrgMode && isFallback && (
                <div className="profile-fallback-note">
                  <p>This information was imported from your Bluesky profile. Edit your Certified profile to customize it.</p>
                </div>
              )}
              <dl className="personal-info__grid">
                {!isOrgMode && (
                  <div>
                    <dt className="personal-info__label">Display Name</dt>
                    <dd className="personal-info__field">{displayProfile?.displayName || "—"}</dd>
                  </div>
                )}
                <div className="personal-info__full-width">
                  <dt className="personal-info__label">About</dt>
                  <dd className="personal-info__field">{displayProfile?.description || "—"}</dd>
                </div>
                <div className="personal-info__full-width">
                  <dt className="personal-info__label">Website</dt>
                  <dd className="personal-info__field">
                    {displayProfile?.website ? (
                      <a href={displayProfile.website} target="_blank" rel="noopener noreferrer" className="personal-info__field--link">
                        {displayProfile.website}
                      </a>
                    ) : "—"}
                  </dd>
                </div>
                {isOrgMode && (
                  <div>
                    <dt className="personal-info__label">Founded</dt>
                    <dd className="personal-info__field">
                      {orgMetadata?.foundedDate
                        ? new Date(orgMetadata.foundedDate).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
                        : "—"}
                    </dd>
                  </div>
                )}
                {isOrgMode && orgMetadata?.organizationType && orgMetadata.organizationType.length > 0 && (
                  <div>
                    <dt className="personal-info__label">Type</dt>
                    <dd className="personal-info__field">
                      {orgMetadata.organizationType.join(", ")}
                    </dd>
                  </div>
                )}
                {isOrgMode && orgMetadata?.urls && orgMetadata.urls.length > 0 && (
                  <div className="personal-info__full-width">
                    <dt className="personal-info__label">Links</dt>
                    <dd className="personal-info__field">
                      {orgMetadata.urls.map((u, i) => (
                        <span key={i}>
                          {i > 0 && " · "}
                          <a href={u.url} target="_blank" rel="noopener noreferrer" className="personal-info__field--link">
                            {u.label || u.url}
                          </a>
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Not authenticated — useEffect above will redirect to /welcome
  return null;
}
