import { Container } from "@hypercerts-org/ui-react";
import { type ReactNode, Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteFooter } from "@/components/site-footer";
import { SignedOutBar, SiteHeader } from "@/components/site-header";

// From 64rem the sidebar is the navigation, on the left; narrower, the top bar
// (and on phones the bottom tab bar). Both render, and CSS shows the one that
// fits, so the layout never waits for script.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="app-body">
        <SiteHeader />
        <Suspense fallback={null}>
          <SignedOutBar />
        </Suspense>
        <Container as="main" className="site-main">
          {children}
        </Container>
        <SiteFooter />
      </div>
    </div>
  );
}
