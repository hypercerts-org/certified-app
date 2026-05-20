"use client"

import React from "react"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { usePageTitle } from "@/lib/navbar-context"
import { CONNECTED_APPS } from "@/lib/constants/apps"

export default function AppsPage() {
  usePageTitle("Apps")

  return (
    <div className="apps-page">
      <header className="apps-page__header">
        <span className="apps-page__label">Ecosystem</span>
        <h1 className="apps-page__title">Explore apps</h1>
        <p className="apps-page__intro">
          Apps built on the AT Protocol. Use your Certified identity to get
          started — one account works across them all.
        </p>
      </header>

      <ul className="apps-page__list">
        {CONNECTED_APPS.map((app) => (
          <li key={app.name} className="apps-page__item">
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="apps-page__card"
            >
              <span className="apps-page__logo-wrap">
                <Image
                  src={app.logo}
                  alt=""
                  width={56}
                  height={56}
                  className="apps-page__logo"
                />
              </span>
              <span className="apps-page__body">
                <span className="apps-page__name">{app.name}</span>
                <span className="apps-page__desc">{app.longDesc}</span>
              </span>
              <ArrowUpRight
                size={20}
                strokeWidth={1.75}
                aria-hidden
                className="apps-page__arrow"
              />
            </a>
          </li>
        ))}
      </ul>

      <p className="apps-page__footnote">More apps coming soon.</p>
    </div>
  )
}
