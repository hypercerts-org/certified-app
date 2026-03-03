"use client";

import React from "react";
import Image from "next/image";
import { CONNECTED_APPS, EXPLORE_APPS } from "@/lib/constants/apps";

export default function ConnectedAppsPage() {
  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Connected Apps</h1>
      </div>

      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {/* Connected apps section */}
          <div className="dash-card">
            <div className="connected-apps__header">
              <h2 className="dash-card__title">Connected</h2>
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
                    <Image src={app.logo} alt="" width={40} height={40} className="connected-apps__logo" />
                  </div>
                  <div className="connected-apps__info">
                    <p className="connected-apps__name">{app.name}</p>
                    <p className="connected-apps__desc">{app.longDesc}</p>
                  </div>
                  <span className="connected-apps__status">
                    <span className="connected-apps__dot" aria-hidden="true" />
                    Connected
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Explore more apps section */}
          <div className="dash-card mt-4">
            <div className="connected-apps__header">
              <h2 className="dash-card__title">Explore more apps</h2>
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
                    <Image src={app.logo} alt="" width={40} height={40} className="connected-apps__logo" />
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
  );
}
