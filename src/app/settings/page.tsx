"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth/auth-context";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import { usePageTitle } from "@/lib/navbar-context";
import OrgSettings from "@/components/groups/org-settings";
import ThemeToggle from "@/components/ui/theme-toggle";

const UsernameCard = dynamic(() => import("@/components/dashboard/username-card"));
const EmailSection = dynamic(() => import("@/components/account/email-section"));
const PasswordSection = dynamic(() => import("@/components/account/password-section"));

export default function SettingsPage() {
  usePageTitle("Settings");
  const { did, pdsUrl } = useAuth();
  const { handle, email } = useSession();
  const { activeOrg } = useOrg();

  // When acting as a group, show org settings
  if (activeOrg) {
    return <OrgSettings groupDid={activeOrg.groupDid} org={activeOrg} />;
  }

  return (
    <div className="dashboard">
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {/* Appearance card */}
          <div className="dash-card">
            <h2 className="dash-card__title">Appearance</h2>
            <p className="dash-card__desc">
              Choose how Certified looks to you. Select a light or dark theme, or follow your system preference.
            </p>
            <ThemeToggle />
          </div>

          {/* Username card */}
          <UsernameCard handle={handle} pdsUrl={pdsUrl || undefined} did={did || undefined} />

          {/* Email section */}
          <EmailSection email={email || ""} />

          {/* Password card */}
          <PasswordSection email={email || ""} />
        </div>
      </div>
    </div>
  );
}
