import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
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
      {/* The chrome carries the "Apps" page title (the h1), so the in-page
          heading is an h2 that says what the list is rather than repeating
          the word. */}
      <header className="apps-store__header">
        <h2 className="apps-store__title font-headline text-h2">
          Apps that work with Certified
        </h2>
        <p className="apps-store__intro">
          Sign in to any of them with your Certified account.
        </p>
      </header>

      <ul className="apps-store__grid" data-tour="apps-grid">
        {CONNECTED_APPS.map((app) => (
          <li key={app.name} className="apps-store__cell">
            <SsoAppLink
              url={app.url}
              ssoHandleUrl={"ssoHandleUrl" in app ? app.ssoHandleUrl : undefined}
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
                {/* Visible "opens elsewhere" affordance; the link's
                    sr-only "(opens in new tab)" carries it for AT. */}
                <ArrowUpRight
                  className="apps-store__open"
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <span className="apps-store__desc">{app.longDesc}</span>
            </SsoAppLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
