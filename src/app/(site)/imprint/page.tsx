import Link from "next/link";
import { PageHeader } from "@/components/page-title";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Imprint",
  description:
    "Imprint (Impressum) for Certified, the identity platform operated by the Hypercerts Foundation. Service operator details, authorized representatives, EU representative, and legal contact under § 5 DDG.",
  path: "/imprint",
});

export default function ImprintPage() {
  return (
    <article className="page legal-page">
      <PageHeader title="Imprint" description="Last updated: May 11, 2026" />

      <div className="legal-prose">
        <section>
          <h2>Service operator</h2>
          <p>
            <strong>Hypercerts Foundation</strong>
            <br />
            1209 Orange St.
            <br />
            Wilmington, DE 19801
            <br />
            United States
          </p>
          <p>Legal form: Delaware nonstock corporation</p>
          <p>
            Phone: +1 302 658 7581
            <br />
            Email:{" "}
            <a href="mailto:legal@hypercerts.org" className="legal-link">
              legal@hypercerts.org
            </a>
          </p>
        </section>

        <section>
          <h2>Authorized representatives</h2>
          <p>Holke Brammer (Director)</p>
        </section>

        <section>
          <h2>Representative in the European Union</h2>
          <p>In accordance with Article 27 GDPR:</p>
          <p>
            Holke Brammer
            <br />
            Holzmarktstraße 25
            <br />
            10243 Berlin
            <br />
            Germany
          </p>
          <p>
            Email:{" "}
            <a href="mailto:legal@hypercerts.org" className="legal-link">
              legal@hypercerts.org
            </a>
          </p>
        </section>

        <section>
          <h2>Contact for legal notices and Digital Services Act communications</h2>
          <p>
            Email:{" "}
            <a href="mailto:legal@hypercerts.org" className="legal-link">
              legal@hypercerts.org
            </a>
          </p>
          <p>
            Notice-and-action procedures for content reports are described on the{" "}
            <Link href="/dsa" className="legal-link">
              DSA Compliance Page
            </Link>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
