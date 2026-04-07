"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import { useOrgProfile } from "@/hooks/use-org-profile";
import { useOrg } from "@/lib/organizations/org-context";
import { useSession } from "@/hooks/use-session";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import Button from "@/components/ui/button";

export default function HomeClient() {
  const { isLoading, isAuthenticated, did, openSignIn } = useAuth();
  const { profile, avatarUrl, bannerUrl, isFallback } = useProfile();
  const { activeOrg } = useOrg();
  const { orgProfile, orgMetadata, orgAvatarUrl, orgBannerUrl } = useOrgProfile();
  const { setVariant } = useNavbarVariant();
  const { handle } = useSession();

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      setVariant("transparent");
    }
    return () => {
      setVariant("default");
    };
  }, [isAuthenticated, isLoading, setVariant]);

  // Hide or show the server-rendered landing page based on auth state
  useEffect(() => {
    const landingSsr = document.querySelector(".landing-ssr") as HTMLElement | null;
    if (!landingSsr) return;

    if (isLoading) {
      landingSsr.style.display = "none";
    } else if (isAuthenticated) {
      landingSsr.style.display = "none";
    } else {
      landingSsr.style.display = "";
    }
  }, [isLoading, isAuthenticated]);

  const initials = getInitials(profile?.displayName, did);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__inner">
          <img
            src="/assets/certified_brandmark_black.svg"
            alt=""
            className="loading-screen__logo"
          />
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    // When acting as an organization, show the org profile
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
      ? `/organizations/${encodeURIComponent(activeOrg.groupDid)}/edit-profile`
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
                    ? "The organization's decentralized identifier (DID) — this never changes, even if you update the handle."
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

  // Not authenticated — landing page is server-rendered, just return null
  return null;
}
