"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import AuthGuard from "@/components/layout/auth-guard";

const CONNECTED_APPS = [
  {
    name: "Bluesky",
    desc: "Decentralized social networking built on the AT Protocol. Bluesky gives you control over your social experience with algorithmic choice and portable identity.",
    logo: "/assets/partners/bluesky_logo.svg",
    url: "https://bsky.app",
  },
  {
    name: "Leaflet",
    desc: "A writing tool for the open internet. Leaflet lets you publish long-form content on the AT Protocol, giving you full ownership of your writing and audience.",
    logo: "/assets/partners/leaflet_logo.svg",
    url: "https://leaflet.pub",
  },
];

const EXPLORE_APPS = [
  {
    name: "Ma Earth",
    desc: "Collective Funding for Regenerating Earth. Ma Earth connects communities with regenerative projects, enabling transparent funding and impact tracking through hypercerts.",
    logo: "/assets/partners/maearth_logo.jpeg",
    url: "https://maearth.app",
  },
  {
    name: "GainForest",
    desc: "Co-creating a fair future for nature stewards. GainForest uses AI and blockchain to monitor forests and reward conservation efforts with verifiable impact certificates.",
    logo: "/assets/partners/gainforest_logo.jpeg",
    url: "https://gainforest.app",
  },
  {
    name: "Silvi",
    desc: "Planting the right trees in the right place at the right time. Silvi tracks tree planting and growth with verifiable data, connecting planters with funders through impact claims.",
    logo: "/assets/partners/silvi_logo.jpeg",
    url: "https://silvi.earth",
  },
  {
    name: "Hyperboards",
    desc: "Visualizing and recognizing those who create real value. Hyperboards creates leaderboards and visual displays of hypercerts holders, making impact contributions visible and shareable.",
    logo: "/assets/hyperboards_brandmark.webp",
    url: "https://hyperboards.org",
  },
];

export default function ConnectedAppsPage() {
  return (
    <AuthGuard>
      <div className="dashboard">
        <div className="dashboard__topbar">
          <h1 className="dashboard__page-title">Connected Apps</h1>
        </div>

        <div className="dashboard__body dashboard__body--single">
          <div className="dashboard__main">
            {/* Connected apps section */}
            <div className="dash-card">
              <h3 className="dash-card__title">Connected</h3>
              <p className="dash-card__desc">
                Apps you can sign in to with your Certified identity. Your handle, profile, and data are portable across these apps.
              </p>
            </div>

            {CONNECTED_APPS.map((app) => (
              <div key={app.name} className="dash-card mt-4">
                <div className="app-detail">
                  <div className="app-detail__icon">
                    <img src={app.logo} alt="" className="app-detail__logo" />
                  </div>
                  <div className="app-detail__content">
                    <div className="app-detail__header">
                      <h3 className="app-detail__name">{app.name}</h3>
                      <span className="connected-apps__status">
                        <span className="connected-apps__dot" />
                        Connected
                      </span>
                    </div>
                    <p className="app-detail__desc">{app.desc}</p>
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="app-detail__link"
                    >
                      Visit {app.name}
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            ))}

            {/* Explore more apps section */}
            <div className="dash-card mt-8">
              <h3 className="dash-card__title">Explore more apps</h3>
              <p className="dash-card__desc">
                These apps are building on the hypercerts ecosystem. Connect your Certified identity to get started.
              </p>
            </div>

            {EXPLORE_APPS.map((app) => (
              <div key={app.name} className="dash-card mt-4">
                <div className="app-detail">
                  <div className="app-detail__icon">
                    <img src={app.logo} alt="" className="app-detail__logo" />
                  </div>
                  <div className="app-detail__content">
                    <div className="app-detail__header">
                      <h3 className="app-detail__name">{app.name}</h3>
                      <span className="connected-apps__status connected-apps__status--available">
                        Available
                      </span>
                    </div>
                    <p className="app-detail__desc">{app.desc}</p>
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="app-detail__link"
                    >
                      Visit {app.name}
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
