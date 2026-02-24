"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ErrorMessage from "@/components/ui/error-message";
import ProfileView from "@/components/profile/profile-view";

export default function HomeClient() {
  const { isLoading, session, did, agent, openSignIn, openSignUp } = useAuth();
  const { profile, isLoading: profileLoading, error: profileError, refetch: refetchProfile, avatarUrl, bannerUrl } = useProfile();
  const { setVariant } = useNavbarVariant();

  useEffect(() => {
    if (!session && !isLoading) {
      setVariant("transparent");
    }
    return () => {
      setVariant("default");
    };
  }, [session, isLoading, setVariant]);

  useEffect(() => {
    if (!isLoading && !session) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isLoading, session]);

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

  if (session) {
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
              agent={agent}
            />
          ) : null}
        </div>
      </div>
    );
  }

  // Not authenticated - Landing page
  return (
    <section className="hero">
      <div className="hero__bg" aria-hidden="true" />
      <div className="hero__inner">
        <h1 className="hero__title hero-reveal">
          One account.<br />Any app.
        </h1>
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
            <Link href="/why-certified" className="hero__btn-secondary">
              Learn more
            </Link>
          </div>
        </div>
      </div>
      <footer className="hero__footer">
        <div className="hero__footer-inner">
          <p>&copy; 2026 Certified. All rights reserved.</p>
          <div className="hero__footer-links">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Policy</Link>
          </div>
        </div>
      </footer>
    </section>
  );
}
