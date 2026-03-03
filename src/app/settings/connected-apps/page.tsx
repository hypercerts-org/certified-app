"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import AuthGuard from "@/components/layout/auth-guard";

const CONNECTED_APPS = [
  {
    name: "Ma Earth",
    desc: "Collective Funding for Regenerating Earth",
    logo: "/assets/partners/maearth_logo.jpeg",
    url: "https://maearth.app",
    longDesc: "Ma Earth connects communities with regenerative projects, enabling transparent funding and impact tracking through hypercerts.",
  },
  {
    name: "GainForest",
    desc: "Co-creating a fair future for nature stewards",
    logo: "/assets/partners/gainforest_logo.jpeg",
    url: "https://gainforest.app",
    longDesc: "GainForest uses AI and blockchain to monitor forests and reward conservation efforts with verifiable impact certificates.",
  },
  {
    name: "Silvi",
    desc: "Planting the right trees in the right place at the right time",
    logo: "/assets/partners/silvi_logo.jpeg",
    url: "https://silvi.earth",
    longDesc: "Silvi tracks tree planting and growth with verifiable data, connecting planters with funders through impact claims.",
  },
  {
    name: "Hyperboards",
    desc: "Visualizing and recognizing those who create real value",
    logo: "/assets/hyperboards_brandmark.webp",
    url: "https://hyperboards.org",
    longDesc: "Hyperboards creates leaderboards and visual displays of hypercerts holders, making impact contributions visible and shareable.",
  },
];

const EXPLORE_APPS = [
  {
    name: "Bluesky",
    desc: "Decentralized social networking",
    logo: "/assets/partners/bluesky_logo.svg",
    url: "https://bsky.app",
    longDesc: "Decentralized social networking built on the AT Protocol. Bluesky gives you control over your social experience with algorithmic choice and portable identity.",
  },
  {
    name: "Leaflet",
    desc: "A writing tool for the open internet",
    logo: "/assets/partners/leaflet_logo.svg",
    url: "https://leaflet.pub",
    longDesc: "Leaflet lets you publish long-form content on the AT Protocol, giving you full ownership of your writing and audience.",
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
              <div className="connected-apps__header">
                <h3 className="dash-card__title">Connected</h3>
                <span className="connected-apps__count">{CONNECTED_APPS.length} apps</span>
              </div>
              <p className="dash-card__desc">
                Apps you can sign in to with your Certified identity. Your handle, profile, and data are portable across these apps.
              </p>
              <div className="connected-apps__list">
                {CONNECTED_APPS.map((app) => (
                  <a
                    key={app.name}
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="connected-apps__item connected-apps__item--link"
                  >
                    <div className="connected-apps__icon">
                      <img src={app.logo} alt="" className="connected-apps__logo" />
                    </div>
                    <div className="connected-apps__info">
                      <p className="connected-apps__name">{app.name}</p>
                      <p className="connected-apps__desc">{app.longDesc}</p>
                    </div>
                    <span className="connected-apps__status">
                      <span className="connected-apps__dot" />
                      Connected
                    </span>
                  </a>
                ))}
              </div>
            </div>

            {/* Explore more apps section */}
            <div className="dash-card mt-4">
              <div className="connected-apps__header">
                <h3 className="dash-card__title">Explore more apps</h3>
                <span className="connected-apps__count">{EXPLORE_APPS.length} apps</span>
              </div>
              <p className="dash-card__desc">
                More apps built on the AT Protocol. Use your Certified identity to get started.
              </p>
              <div className="connected-apps__list">
                {EXPLORE_APPS.map((app) => (
                  <a
                    key={app.name}
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="connected-apps__item connected-apps__item--link"
                  >
                    <div className="connected-apps__icon">
                      <img src={app.logo} alt="" className="connected-apps__logo" />
                    </div>
                    <div className="connected-apps__info">
                      <p className="connected-apps__name">{app.name}</p>
                      <p className="connected-apps__desc">{app.longDesc}</p>
                    </div>
                    <span className="connected-apps__status connected-apps__status--available">
                      Available
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
