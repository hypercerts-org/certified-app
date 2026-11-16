import { Container } from "@hypercerts-org/ui-react";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <Container as="main" className="site-main">
        {children}
      </Container>
    </>
  );
}
