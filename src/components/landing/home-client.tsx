"use client";

import { useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
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

// Landing sections — only loaded for unauthenticated users
const WhatYouGet = dynamic(() => import("@/components/landing/sections/what-you-get"));
const HowItWorks = dynamic(() => import("@/components/landing/sections/how-it-works"));
const PartnerApps = dynamic(() => import("@/components/landing/sections/partner-apps"));
const BuiltForTrust = dynamic(() => import("@/components/landing/sections/built-for-trust"));
const Faq = dynamic(() => import("@/components/landing/sections/faq"));
const ReadyCta = dynamic(() => import("@/components/landing/sections/ready-cta"));

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

  // Not authenticated - Landing page
  return (
    <>
      <section className="hero hero--landing">
        {/* Line-art pattern background */}
        <div className="hero__pattern" aria-hidden="true">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <circle cx="50%" cy="50%" r="300" fill="none" stroke="currentColor" strokeWidth="0.3" />
            <circle cx="50%" cy="50%" r="400" fill="none" stroke="currentColor" strokeWidth="0.15" />
            <line x1="0%" y1="0%" x2="100%" y2="100%" stroke="currentColor" strokeWidth="0.15" />
            <line x1="100%" y1="0%" x2="0%" y2="100%" stroke="currentColor" strokeWidth="0.15" />
          </svg>
        </div>

        <div className="hero__inner">
          <span className="hero__label">Built on AT Protocol</span>
          <h1 className="hero__title hero-reveal">
            One account.<br />
            <span className="hero__title-accent">Any app.</span>
          </h1>
          <p className="hero__subtitle hero-reveal">
            Your identity and data — everywhere you go.
          </p>
          <div className="hero-reveal">
            <div className="hero__actions">
              <button className="hero__btn-signin" onClick={openSignIn}>
                <img src="/assets/sign_in_with_certified_black.svg" alt="Sign in with Certified" className="hero__btn-signin-img" />
              </button>
            </div>
          </div>
        </div>
      </section>
      <WhatYouGet />
      <HowItWorks />
      <PartnerApps />
      <BuiltForTrust />
      <Faq />
      <ReadyCta />
      <footer className="landing-footer">
        <div className="landing-footer__bar">
          <div className="landing-footer__left">
            <img src="/assets/certified_wordmark_black_green.png" alt="Certified" className="landing-footer__logo-img" />
            <span className="landing-footer__copy">&copy; 2026 Hypercerts Foundation</span>
          </div>
          <div className="landing-footer__links">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
