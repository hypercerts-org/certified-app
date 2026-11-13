import PageTitle from "@/components/layout/page-title"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import AppTile from "@/components/apps/app-tile"
import { CONNECTED_APPS } from "@/lib/constants/apps"

// Server component: /apps is a public, sitemap-listed directory of a
// fixed partner list, so the grid ships as RSC payload. The client pieces
// are the page header (it registers with the chrome), the navbar-title
// island and each tile's <SsoAppLink> href upgrade (session-dependent).
export default function AppsPage() {
  return (
    <PageContainer>
      <PageTitle title="Apps" />
      <PageHeader
        title="Apps"
        description="Apps you can sign in to with your Certified account."
      />

      {/* One column on phones, two from 800px, three from 1300px. The top
          padding adds to the header's 16px margin (a margin would collapse
          into it): 24px on phones, 32px from 800px. */}
      <ul
        className="m-0 grid list-none grid-cols-1 gap-4 p-0 pt-2 md:grid-cols-2 md:pt-4 xl:grid-cols-3"
        data-tour="apps-grid"
      >
        {CONNECTED_APPS.map((app) => (
          <li key={app.name} className="flex">
            <AppTile app={app} size="lg" showLongDescription />
          </li>
        ))}
      </ul>
    </PageContainer>
  )
}
