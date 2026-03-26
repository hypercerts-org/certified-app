"use client";

import { useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import Button from "@/components/ui/button";

// Dashboard components — only loaded for authenticated users
const SignInPreviewCard = dynamic(() => import("@/components/dashboard/sign-in-preview-card"));
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
                {bannerUrl ? (
                  <img src={bannerUrl} alt="" />
                ) : null}
              </div>
              <div className="profile-card">
                <Avatar size="lg" src={avatarUrl || undefined} fallbackInitials={initials} bordered />
                <div className="profile-card__info">
                  <h2 className="profile-card__name">{profile?.displayName || "Anonymous"}</h2>
                  <p className="profile-card__handle">@{handle}</p>
                </div>
                <Link href="/settings/edit-profile">
                  <Button variant="ghost" size="sm">
                    <Pencil size={14} />
                    Edit
                  </Button>
                </Link>
              </div>
              <dl className="profile-card__did">
                <dt className="personal-info__label">Identifier</dt>
                <dd className="personal-info__field personal-info__field--mono">{did}</dd>
                <dd className="personal-info__hint">Your stable decentralized identifier (DID) — this never changes, even if you update your username.</dd>
              </dl>
            </div>

            {/* Account Details card */}
            <div className="dash-card mt-4">
              <div className="username-card__header">
                <h2 className="dash-card__title" style={{ marginBottom: 0 }}>Account Details</h2>
                <Link href="/settings/edit-profile">
                  <Button variant="ghost" size="sm">
                    <Pencil size={14} />
                    Edit
                  </Button>
                </Link>
              </div>
              {isFallback && (
                <div className="profile-fallback-note">
                  <p>This information was imported from your Bluesky profile. Edit your Certified profile to customize it.</p>
                </div>
              )}
              <dl className="personal-info__grid">
                <div>
                  <dt className="personal-info__label">Display Name</dt>
                  <dd className="personal-info__field">{profile?.displayName || "—"}</dd>
                </div>
                <div className="personal-info__full-width">
                  <dt className="personal-info__label">About</dt>
                  <dd className="personal-info__field">{profile?.description || "—"}</dd>
                </div>
                <div className="personal-info__full-width">
                  <dt className="personal-info__label">Website</dt>
                  <dd className="personal-info__field">
                    {profile?.website ? (
                      <a href={profile.website} target="_blank" rel="noopener noreferrer" className="personal-info__field--link">
                        {profile.website}
                      </a>
                    ) : "—"}
                  </dd>
                </div>
              </dl>
            </div>

          </div>

          {/* Right sidebar */}
          <div className="dashboard__aside">
            <SignInPreviewCard />
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
            Your identity and data — everywhere you go. One account across many platforms, with no new logins and no lock-in.
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
