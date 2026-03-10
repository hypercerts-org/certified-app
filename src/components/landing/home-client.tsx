"use client";

import React, { useEffect } from "react";
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
            src="/assets/certified_brandmark.svg"
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
                <div className="profile-card__did">
                  <p className="personal-info__field personal-info__field--mono">{did}</p>
                  <p className="personal-info__hint">Your stable decentralized identifier (DID) — this never changes, even if you update your username.</p>
                </div>
              </div>
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
        <div className="hero__bg" aria-hidden="true" />
        <div className="hero__inner">
          <h1 className="hero__title hero-reveal">One account.<br />Any app.</h1>
          <p className="hero__subtitle hero-reveal">
            Your identity and data — everywhere you go.
          </p>
          <div className="hero-reveal">
            <div className="hero__actions">
              <button className="hero__btn-primary" onClick={openSignIn}>
                <img src="/assets/certified_brandmark.svg" alt="" className="hero__btn-icon" />
                Sign in with Certified
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
        <div className="landing-footer__inner">
          <p>&copy; 2026 Certified. All rights reserved.</p>
          <div className="landing-footer__links">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
