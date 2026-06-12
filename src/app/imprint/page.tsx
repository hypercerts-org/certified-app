import type { Metadata } from "next";
import Link from "next/link";
import LandingTopBar from "@/components/landing/landing-topbar";

export const metadata: Metadata = {
  title: "Imprint",
  description:
    "Imprint (Impressum) for Certified, the identity platform operated by the Hypercerts Foundation. Service operator details, authorized representatives, EU representative, and legal contact under § 5 DDG.",
  alternates: { canonical: "https://certified.app/imprint" },
  openGraph: {
    title: "Imprint — Certified",
    description:
      "Imprint (Impressum) for Certified, the identity platform operated by the Hypercerts Foundation.",
    url: "https://certified.app/imprint",
    type: "website",
    images: [{ url: "/assets/certs-hero-1200x630.png", width: 1200, height: 630, alt: "Certified — One account. Your work. Recognized everywhere." }],
  },
};

export default function ImprintPage() {
  return (
    <div className="app-page legal-page">
      <LandingTopBar />
      <div className="app-page__inner">
        <h1 className="font-headline text-h1 text-[var(--fg-primary)] tracking-tight mb-8">
          Imprint
        </h1>

        <p className="text-sm text-[var(--fg-muted)] mb-8">Last updated: May 11, 2026</p>

        <div className="prose max-w-none space-y-8">
          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">Service operator</h2>
            <p>
              <strong>Hypercerts Foundation</strong>
              <br />
              1209 Orange St.
              <br />
              Wilmington, DE 19801
              <br />
              United States
            </p>
            <p className="mt-4">Legal form: Delaware nonstock corporation</p>
            <p className="mt-4">
              Phone: +1 302 658 7581
              <br />
              Email:{" "}
              <a
                href="mailto:legal@hypercerts.org"
                className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
              >
                legal@hypercerts.org
              </a>
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">Authorized representatives</h2>
            <p>Holke Brammer (Director)</p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">
              Representative in the European Union
            </h2>
            <p>In accordance with Article 27 GDPR:</p>
            <p className="mt-4">
              Holke Brammer
              <br />
              Holzmarktstraße 25
              <br />
              10243 Berlin
              <br />
              Germany
            </p>
            <p className="mt-4">
              Email:{" "}
              <a
                href="mailto:legal@hypercerts.org"
                className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
              >
                legal@hypercerts.org
              </a>
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">
              Contact for legal notices and Digital Services Act communications
            </h2>
            <p>
              Email:{" "}
              <a
                href="mailto:legal@hypercerts.org"
                className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
              >
                legal@hypercerts.org
              </a>
            </p>
            <p className="mt-4">
              Notice-and-action procedures for content reports are described on the{" "}
              <Link href="/dsa" className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]">
                DSA Compliance Page
              </Link>
              .
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
