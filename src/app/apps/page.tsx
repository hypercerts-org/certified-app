"use client"

import React from "react"
import Image from "next/image"
import { usePageTitle } from "@/lib/navbar-context"
import { CONNECTED_APPS } from "@/lib/constants/apps"

export default function AppsPage() {
  usePageTitle("Apps")

  return (
    <div className="dashboard">
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          <div className="dash-card">
            <div className="connected-apps__header">
              <h2 className="dash-card__title">Explore apps</h2>
              <span className="connected-apps__count">
                {CONNECTED_APPS.length} apps
              </span>
            </div>
            <p className="dash-card__desc">
              Apps built on the AT Protocol. Use your Certified identity to get
              started.
            </p>
            <ul className="connected-apps__list">
              {CONNECTED_APPS.map((app) => (
                <li key={app.name} className="connected-apps__item-wrap">
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="connected-apps__item connected-apps__item--link"
                  >
                    <div className="connected-apps__icon">
                      <Image
                        src={app.logo}
                        alt=""
                        width={40}
                        height={40}
                        className="connected-apps__logo"
                      />
                    </div>
                    <div className="connected-apps__info">
                      <p className="connected-apps__name">{app.name}</p>
                      <p className="connected-apps__desc">{app.longDesc}</p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
