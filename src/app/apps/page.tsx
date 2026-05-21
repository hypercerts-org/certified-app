"use client"

import React from "react"
import Image from "next/image"
import { usePageTitle } from "@/lib/navbar-context"
import { useSession } from "@/hooks/use-session"
import { CONNECTED_APPS } from "@/lib/constants/apps"

export default function AppsPage() {
  usePageTitle("Apps")
  const { handle } = useSession()

  return (
    <div className="apps-store">
      <header className="apps-store__header">
        <span className="apps-store__eyebrow">Ecosystem</span>
        <h1 className="apps-store__title">Apps</h1>
        <p className="apps-store__intro">
          Apps built on the AT Protocol. One Certified identity, every app.
        </p>
      </header>

      <ul className="apps-store__grid">
        {CONNECTED_APPS.map((app) => {
          // Silent SSO: if the partner exposes an ePDS handle-login
          // endpoint AND the viewer is signed in, deep-link them via
          // the shared Certified PDS session so they land already
          // signed in. Otherwise fall through to the marketing URL.
          const ssoTemplate =
            "ssoHandleUrl" in app ? app.ssoHandleUrl : undefined
          const href =
            handle && ssoTemplate
              ? ssoTemplate + encodeURIComponent(handle)
              : app.url
          return (
            <li key={app.name} className="apps-store__cell">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="apps-store__tile"
                aria-label={`${app.name} — ${app.desc}`}
              >
              <span className="apps-store__row">
                <span className="apps-store__icon-wrap">
                  <Image
                    src={app.logo}
                    alt=""
                    width={88}
                    height={88}
                    className="apps-store__icon"
                  />
                </span>
                <span className="apps-store__meta">
                  <span className="apps-store__name">{app.name}</span>
                  <span className="apps-store__tag">{app.desc}</span>
                </span>
              </span>
              <span className="apps-store__desc">{app.longDesc}</span>
              </a>
            </li>
          )
        })}
      </ul>

      <p className="apps-store__footnote">More apps coming soon.</p>
    </div>
  )
}
