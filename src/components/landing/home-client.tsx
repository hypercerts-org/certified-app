"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import { authFetch } from "@/lib/auth/fetch";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import Button from "@/components/ui/button";

// Dashboard components — only loaded for authenticated users
const SignInPreviewCard = dynamic(() => import("@/components/dashboard/sign-in-preview-card"));
const IdentityOverviewCard = dynamic(() => import("@/components/dashboard/identity-overview-card"));
const RecentActivityCard = dynamic(() => import("@/components/dashboard/recent-activity-card"));
const ConnectedAppsList = dynamic(() => import("@/components/dashboard/connected-apps-list"));

// Landing sections — only loaded for unauthenticated users
const WhatYouGet = dynamic(() => import("@/components/landing/sections/what-you-get"));
const HowItWorks = dynamic(() => import("@/components/landing/sections/how-it-works"));
const PartnerApps = dynamic(() => import("@/components/landing/sections/partner-apps"));
const BuiltForTrust = dynamic(() => import("@/components/landing/sections/built-for-trust"));
const Faq = dynamic(() => import("@/components/landing/sections/faq"));
const ReadyCta = dynamic(() => import("@/components/landing/sections/ready-cta"));

export default function HomeClient() {
  const { isLoading, isAuthenticated, did, openSignUp } = useAuth();
  const { profile, avatarUrl } = useProfile();
  const { setVariant } = useNavbarVariant();
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      setVariant("transparent");
    }
    return () => {
      setVariant("default");
    };
  }, [isAuthenticated, isLoading, setVariant]);

  useEffect(() => {
    if (isAuthenticated) {
      authFetch("/api/xrpc/com/atproto/server/getSession")
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.handle) setHandle(data.handle);
          if (data?.email) setEmail(data.email);
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

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
              <div className="profile-card">
                <Avatar size="lg" src={avatarUrl || undefined} fallbackInitials={initials} bordered />
                <div className="profile-card__info">
                  <h2 className="profile-card__name">{profile?.displayName || "Anonymous"}</h2>
                  <p className="profile-card__handle">@{handle}</p>
                  {profile?.description && (
                    <p className="profile-card__bio">{profile.description}</p>
                  )}
                </div>
                <Link href="/settings/edit-profile">
                  <Button variant="secondary" size="sm">
                    <Pencil size={14} />
                    Edit Profile
                  </Button>
                </Link>
              </div>
            </div>

            {/* Personal Information card */}
            <div className="dash-card mt-4">
              <h3 className="dash-card__title">Personal Information</h3>
              <p className="dash-card__desc">This information is shared when you sign in to apps using Certified.</p>
              <div className="personal-info__grid">
                <div>
                  <label className="personal-info__label">First Name</label>
                  <div className="personal-info__field">{profile?.displayName?.split(" ")[0] || "—"}</div>
                </div>
                <div>
                  <label className="personal-info__label">Last Name</label>
                  <div className="personal-info__field">{profile?.displayName?.split(" ").slice(1).join(" ") || "—"}</div>
                </div>
              </div>
              <div className="mt-4">
                <label className="personal-info__label">Email Address</label>
                <div className="personal-info__field">{email || "—"}</div>
              </div>
              <div className="mt-4">
                <label className="personal-info__label">Handle (DID)</label>
                <div className="personal-info__field personal-info__field--mono">{did}</div>
              </div>
            </div>

            {/* Connected Apps */}
            <div className="mt-4">
              <ConnectedAppsList />
            </div>
          </div>

          {/* Right sidebar */}
          <div className="dashboard__aside">
            <SignInPreviewCard />
            <IdentityOverviewCard />
            <RecentActivityCard />
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
              <button className="hero__btn-primary" onClick={openSignUp}>
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
            <Link href="/privacy">Policy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
