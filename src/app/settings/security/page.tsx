"use client";

import React from "react";

export default function SecurityPage() {
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
            <p className="security__2fa-note">This will be available soon.</p>
          </div>

          {/* App Passwords card */}
          <div className="dash-card mt-4">
            <h2 className="dash-card__title">App passwords</h2>
            <p className="dash-card__desc">
              Use app passwords to sign in to other apps without giving full access to your account or your password.
            </p>
            <p className="security__2fa-note">This will be available soon.</p>
          </div>

          {/* 2FA card */}
          <div className="dash-card mt-4">
            <h2 className="dash-card__title">Two-factor authentication</h2>
            <p className="dash-card__desc">
              Add an extra layer of security to your account.
            </p>
            <p className="security__2fa-note">This will be available soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
