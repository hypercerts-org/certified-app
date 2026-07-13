import Image from "next/image"
import PageTitle from "@/components/layout/page-title"
import { CONNECTED_APPS } from "@/lib/constants/apps"
import SsoAppLink from "./sso-app-link"

// Server component: /apps is a public, sitemap-listed directory of a
// fixed partner list, so the grid ships as RSC payload. The only
// client pieces are the navbar-title island and the per-tile
// <SsoAppLink> href upgrade (session-dependent).
export default function AppsPage() {
  return (
    <div className="apps-store">
      <PageTitle title="Apps" />
      {/* The navbar already carries the "Apps" page title — no eyebrow /
          h1 repeat here, just the one-line intro. */}
      <header className="apps-store__header">
        <p className="apps-store__intro">
          Apps built with Certified on AT Protocol.
        </p>
      </header>

      <ul className="apps-store__grid" data-tour="apps-grid">
        {CONNECTED_APPS.map((app) => (
          <li key={app.name} className="apps-store__cell">
            <SsoAppLink
              url={app.url}
              ssoHandleUrl={"ssoHandleUrl" in app ? app.ssoHandleUrl : undefined}
              ariaLabel={`${app.name} — ${app.desc}`}
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
            </SsoAppLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
