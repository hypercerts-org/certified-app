"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import Button from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ErrorMessage from "@/components/ui/error-message";
import ProfileView from "@/components/profile/profile-view";

export default function Home() {
  const { isLoading, session, did, signIn, signUp } = useAuth();
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
    // Authenticated state
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8 bg-gray-50 min-h-screen">
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
    );
  }

  // Not authenticated - Landing page
  return (
    <section id="hero" className="hero">
      <div className="hero__bg" aria-hidden="true" />
      <div className="hero__inner">
        <h1 className="hero-reveal">
          One account.
          <br />
          Any app.
        </h1>
        <p className="hero-reveal">
          Your identity and data — everywhere you go.
        </p>
        <div className="hero-reveal">
          <div className="hero__actions">
            <Button variant="primary" size="lg" onClick={signUp}>
              Create your Certified ID
            </Button>
            <Link href="/why-certified" className="hero__btn-secondary">
              Learn more
            </Link>
          </div>
        </div>
      </div>
      <footer className="hero__footer">
        <div className="hero__footer-inner">
          <p>© 2026 Certified. All rights reserved.</p>
          <div className="hero__footer-links">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Policy</Link>
          </div>
        </div>
      </footer>
    </section>
  );
}
