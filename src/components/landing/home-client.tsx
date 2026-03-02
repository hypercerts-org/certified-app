"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ErrorMessage from "@/components/ui/error-message";
import ProfileView from "@/components/profile/profile-view";
import WhatYouGet from "@/components/landing/sections/what-you-get";
import HowItWorks from "@/components/landing/sections/how-it-works";
import PartnerApps from "@/components/landing/sections/partner-apps";
import BuiltForTrust from "@/components/landing/sections/built-for-trust";
import Faq from "@/components/landing/sections/faq";
import ReadyCta from "@/components/landing/sections/ready-cta";

export default function HomeClient() {
  const { isLoading, isAuthenticated, did, openSignUp } = useAuth();
  const { profile, isLoading: profileLoading, error: profileError, refetch: refetchProfile, avatarUrl, bannerUrl } = useProfile();
  const { setVariant } = useNavbarVariant();

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      setVariant("transparent");
    }
    return () => {
      setVariant("default");
    };
  }, [isAuthenticated, isLoading, setVariant]);

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
      <div className="app-page">
        <div className="app-page__inner">
          {profileLoading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <LoadingSpinner size="md" />
            </div>
          ) : profileError ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <ErrorMessage message={profileError} onRetry={refetchProfile} />
            </div>
          ) : did ? (
            <ProfileView
              profile={profile}
              did={did}
              avatarUrl={avatarUrl}
              bannerUrl={bannerUrl}
            />
          ) : null}
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
                Create your Certified ID
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.5 4.5L13 10m0 0l-5.5 5.5M13 10H3" />
                </svg>
              </button>
              <a href="#what-you-get" className="hero__btn-secondary">
                Learn more
              </a>
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
