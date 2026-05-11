import type { Metadata } from "next";

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
    images: [{ url: "/assets/certified-hero-1200x630.png", width: 1200, height: 630, alt: "Certified — One account, any app" }],
  },
};

export default function ImprintPage() {
  return (
    <div className="app-page">
      <div className="app-page__inner max-w-3xl">
        <h1 className="font-mono text-h1 text-navy tracking-tight mb-8">
          Impressum / Imprint
        </h1>

        <p className="text-sm text-gray-500 mb-8">Last updated: May 11, 2026</p>

        <div className="prose prose-navy max-w-none space-y-8">
          <section>
            <h2 className="font-mono text-xl text-navy mb-4">Service operator</h2>
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
                className="text-blue-600 underline hover:text-blue-800"
              >
                legal@hypercerts.org
              </a>
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">Authorized representatives</h2>
            <p>Holke Brammer</p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
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
                className="text-blue-600 underline hover:text-blue-800"
              >
                legal@hypercerts.org
              </a>
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              Contact for legal notices and Digital Services Act communications
            </h2>
            <p>
              Email:{" "}
              <a
                href="mailto:legal@hypercerts.org"
                className="text-blue-600 underline hover:text-blue-800"
              >
                legal@hypercerts.org
              </a>
            </p>
            <p className="mt-4">
              Notice-and-action procedures for content reports are described on the{" "}
              <a href="/dsa" className="text-blue-600 underline hover:text-blue-800">
                DSA Compliance Page
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">Online dispute resolution</h2>
            <p>
              The European Commission provides a platform for online dispute resolution (ODR):{" "}
              <a
                href="https://ec.europa.eu/consumers/odr"
                className="text-blue-600 underline hover:text-blue-800"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://ec.europa.eu/consumers/odr
              </a>
            </p>
            <p className="mt-4">
              The Hypercerts Foundation is not obligated and not willing to participate in dispute
              resolution proceedings before a consumer arbitration board.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
