"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth/auth-context";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/organizations/org-context";
import OrgSettings from "@/components/organizations/org-settings";

const UsernameCard = dynamic(() => import("@/components/dashboard/username-card"));
const EmailSection = dynamic(() => import("@/components/account/email-section"));
const PasswordSection = dynamic(() => import("@/components/account/password-section"));

export default function SettingsPage() {
  const { did, pdsUrl } = useAuth();
  const { handle, email } = useSession();
  const { activeOrg } = useOrg();

  // When acting as an organization, show org settings
  if (activeOrg) {
    return <OrgSettings groupDid={activeOrg.groupDid} org={activeOrg} />;
  }

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Settings</h1>
      </div>

      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {/* Username card */}
          <UsernameCard handle={handle} pdsUrl={pdsUrl || undefined} did={did || undefined} />

          {/* Email section */}
          <EmailSection email={email || ""} />

          {/* Password card */}
          <PasswordSection email={email || ""} />

          {/* App Passwords card */}
          <div className="dash-card">
            <h2 className="dash-card__title">App passwords</h2>
            <p className="dash-card__desc">
              Use app passwords to sign in to other apps without giving full access to your account or your password.
            </p>
            <p className="settings__note">This will be available soon.</p>
          </div>

          {/* 2FA card */}
          <div className="dash-card">
            <h2 className="dash-card__title">Two-factor authentication</h2>
            <p className="dash-card__desc">
              Add an extra layer of security to your account.
            </p>
            <p className="settings__note">This will be available soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
