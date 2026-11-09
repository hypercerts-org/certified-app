import { Container, Text } from "@hypercerts-org/ui-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { UserMenu } from "@/components/user-menu";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <Container as="div">
          <nav aria-label="Main">
            <Link href="/" className="brand" aria-label="Certified home">
              <Image
                src="/brand/wordmark/certified_wordmark_black.svg"
                alt="Certified"
                width={99}
                height={19}
                preload
              />
            </Link>
            <Link href="/explore">
              <Text as="span" size="body-sm" tone="ink">
                Explore
              </Text>
            </Link>
            {/* Per-visitor, so it streams in after the cached page shell. */}
            <Suspense fallback={<div className="user-menu" />}>
              <UserMenu />
            </Suspense>
          </nav>
        </Container>
      </header>
      <Container as="main" className="site-main">
        {children}
      </Container>
    </>
  );
}
