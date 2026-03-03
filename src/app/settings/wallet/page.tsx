"use client";

import React from "react";
import AuthGuard from "@/components/layout/auth-guard";
import { useAuth } from "@/lib/auth/auth-context";
import IdentityLinkCard from "@/components/identity-link/identity-link-card";

export default function WalletPage() {
  const { did } = useAuth();

  return (
    <AuthGuard>
      <div className="dashboard">
        <div className="dashboard__topbar">
          <h1 className="dashboard__page-title">Wallet</h1>
        </div>

        <div className="dashboard__body dashboard__body--single">
          <div className="dashboard__main">
            {/* Intro card */}
            <div className="dash-card">
              <h3 className="dash-card__title">Linked Wallets</h3>
              <p className="dash-card__desc">
                Link your Ethereum wallets to your Certified identity. Each link is a signed attestation stored in your personal data server, proving you own the wallet address.
              </p>
            </div>

            {/* Identity Link Card */}
            <div className="dash-card mt-4">
              <IdentityLinkCard did={did} />
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
