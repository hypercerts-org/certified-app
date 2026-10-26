import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import { Container, Text } from "@/components/ui"

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
                height={20}
                priority
              />
            </Link>
            <Link href="/explore">
              <Text as="span" size="body-sm" tone="ink">
                Explore
              </Text>
            </Link>
          </nav>
        </Container>
      </header>
      <Container as="main" className="site-main">
        {children}
      </Container>
    </>
  )
}
