"use client";

import React from "react";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import { ArrowLeftRight, LogOut } from "lucide-react";
import type { Group } from "@/lib/groups/types";

interface AccountSwitcherListProps {
  session: { handle: string | null };
  profile: { displayName?: string } | null;
  avatarUrl: string | undefined;
  sortedOrgs: Group[];
  activeOrg: Group | null;
  switchOrg: (org: Group | null) => void;
  /** Called after a switch is committed. Receives the newly-selected org
   * (null = personal) so the parent can navigate to the right place
   * (e.g. /groups/<did> for an org, / for personal). */
  onAfterSwitch: (next: Group | null) => void;
  onSignOut: () => void;
  /** Open the sign-in flow to add / switch to a different individual
   *  atproto account. Replaces the current session on completion. */
  onSwitchAccount: () => void;
}

export default function AccountSwitcherList({
  session,
  profile,
  avatarUrl,
  sortedOrgs,
  activeOrg,
  switchOrg,
  onAfterSwitch,
  onSignOut,
  onSwitchAccount,
}: AccountSwitcherListProps) {
  const { handle } = session;

  return (
    <>
      {/* User section */}
      <p className="account-switcher__section-label">User</p>
      <div className="account-switcher__user-row">
        <button
          role="menuitem"
          className={`account-switcher__item ${!activeOrg ? "account-switcher__item--active" : ""}`}
          onClick={() => {
            switchOrg(null);
            onAfterSwitch(null);
          }}
        >
          <Avatar
            src={avatarUrl}
            alt={profile?.displayName || "Personal"}
            size="sm"
            fallbackInitials={getInitials(profile?.displayName || handle || "?")}
          />
          <div>
            <p className="account-switcher__item-name">
              {profile?.displayName || "Personal"}
            </p>
            <p className="account-switcher__item-handle">@{handle}</p>
          </div>
        </button>
        <button
          role="menuitem"
          className="account-switcher__signout"
          onClick={(e) => {
            e.stopPropagation();
            onSwitchAccount();
          }}
          aria-label="Switch to a different account"
          title="Switch account"
        >
          <ArrowLeftRight size={16} />
        </button>
      </div>

      {sortedOrgs.length > 0 && (
        <>
          <div className="account-switcher__divider" />
          <p className="account-switcher__section-label">Groups</p>
          {sortedOrgs.map((org) => (
            <button
              role="menuitem"
              key={org.groupDid}
              className={`account-switcher__item ${activeOrg?.groupDid === org.groupDid ? "account-switcher__item--active" : ""}`}
              onClick={() => {
                switchOrg(org);
                onAfterSwitch(org);
              }}
            >
              <Avatar
                src={org.avatarUrl}
                alt={org.displayName || org.handle}
                size="sm"
                fallbackInitials={(org.displayName || org.handle).slice(0, 2)}
              />
              <div>
                <p className="account-switcher__item-name">
                  {org.displayName || org.handle}
                </p>
                <p className="account-switcher__item-handle">{org.role}</p>
              </div>
            </button>
          ))}
        </>
      )}

      <div className="account-switcher__divider" />
      <button
        role="menuitem"
        className="account-switcher__signout-row"
        onClick={(e) => {
          e.stopPropagation();
          onSignOut();
        }}
      >
        <LogOut size={16} aria-hidden />
        <span>Sign out</span>
      </button>
    </>
  );
}
