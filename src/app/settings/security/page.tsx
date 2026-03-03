"use client";

import React from "react";
import PasswordSection from "@/components/account/password-section";
import { useSession } from "@/hooks/use-session";

export default function SecurityPage() {
  const { email, isLoading: sessionLoading } = useSession();

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Security</h1>
      </div>

      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {/* Password card */}
          <div className="dash-card">
            <h2 className="dash-card__title">Password</h2>
            <p className="dash-card__desc">
              Set a password to sign in to other AT Protocol apps (like Bluesky) with your Certified username. Your primary sign-in method remains the email code.
            </p>
            <div className="security__section">
              {sessionLoading ? (
                <p className="security__loading">Loading...</p>
              ) : email ? (
                <PasswordSection email={email} />
              ) : (
                <p className="security__loading">Loading...</p>
              )}
            </div>
          </div>

          {/* 2FA card */}
          <div className="dash-card mt-4">
            <h2 className="dash-card__title">Two-Factor Authentication</h2>
            <p className="dash-card__desc">
              Add an extra layer of security to your account.
            </p>
            <div className="security__2fa">
              <div className="security__2fa-status">
                <div className="security__2fa-badge security__2fa-badge--off">
                  Not enabled
                </div>
              </div>
              <p className="security__2fa-note">
                Two-factor authentication via authenticator app (TOTP) is coming soon. This will be available in a future update.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
