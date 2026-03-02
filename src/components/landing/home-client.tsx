"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Bell, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import { authFetch } from "@/lib/auth/fetch";
import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import SignInPreviewCard from "@/components/dashboard/sign-in-preview-card";
import IdentityOverviewCard from "@/components/dashboard/identity-overview-card";
import RecentActivityCard from "@/components/dashboard/recent-activity-card";
import ConnectedAppsList from "@/components/dashboard/connected-apps-list";
import WhatYouGet from "@/components/landing/sections/what-you-get";
import HowItWorks from "@/components/landing/sections/how-it-works";
import PartnerApps from "@/components/landing/sections/partner-apps";
import BuiltForTrust from "@/components/landing/sections/built-for-trust";
import Faq from "@/components/landing/sections/faq";
import ReadyCta from "@/components/landing/sections/ready-cta";

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

  const initials = (() => {
    const name = profile?.displayName || null;
    if (!name) return did?.slice(4, 6) || "?";
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  })();

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
          <div className="dashboard__topbar-right">
            <div className="dashboard__search">
              <Search size={16} />
              <span>Search settings...</span>
            </div>
            <button className="dashboard__notification" aria-label="Notifications">
              <Bell size={18} />
            </button>
          </div>
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
