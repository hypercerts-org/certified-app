import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Digital Services Act — Compliance Information",
  description:
    "DSA compliance information for Certified, operated by the Hypercerts Foundation. Includes notice-and-action procedures and contact information.",
  alternates: { canonical: "https://certified.app/dsa" },
  openGraph: {
    title: "DSA Compliance — Certified",
    description:
      "Digital Services Act compliance information for Certified, operated by the Hypercerts Foundation.",
    url: "https://certified.app/dsa",
    type: "website",
    images: [{ url: "/assets/certified-hero-1200x630.png", width: 1200, height: 630, alt: "Certified — One account, any app" }],
  },
};

export default function DsaPage() {
  return (
    <div className="app-page">
      <div className="app-page__inner max-w-3xl">
        <h1 className="font-mono text-h1 text-navy tracking-tight mb-8">
          Digital Services Act — Compliance Information
        </h1>

        <p className="text-sm text-gray-500 mb-8">Last updated: March 15, 2026</p>

        <div className="prose prose-navy max-w-none space-y-8">
          <section>
            <h2 className="font-mono text-xl text-navy mb-4">1. About this page</h2>
            <p>
              This page provides information required under the Digital Services Act (Regulation
              (EU) 2022/2065) (&quot;DSA&quot;) regarding the hosting services operated by the
              Hypercerts Foundation in connection with Certified.
            </p>
            <p className="mt-4">
              Certified operates AT Protocol Personal Data Servers (PDS) that store and serve
              identity records and associated user data. Under the DSA, this qualifies as a{" "}
              <strong>hosting service</strong> as defined in Article 3(g)(iii).
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">2. Service provider</h2>
            <p>
              <strong>Hypercerts Foundation</strong>
              <br />A Delaware nonstock corporation
            </p>
            <p className="mt-4">
              Contact:{" "}
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
              3. Legal representative in the European Union
            </h2>
            <p>
              In accordance with Article 13 of the DSA, the Hypercerts Foundation has designated
              the following legal representative in the European Union:
            </p>
            <p className="mt-4">
              Holke Brammer
              <br />
              Holzmarktstraße 25, 10243 Berlin, Germany
              <br />
              <a
                href="mailto:legal@hypercerts.org"
                className="text-blue-600 underline hover:text-blue-800"
              >
                legal@hypercerts.org
              </a>
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">4. Point of contact</h2>
            <p>
              In accordance with Article 11 of the DSA, the single point of contact for
              communications with EU member state authorities, the European Commission, and the
              European Board for Digital Services is:
            </p>
            <p className="mt-4">
              <a
                href="mailto:legal@hypercerts.org"
                className="text-blue-600 underline hover:text-blue-800"
              >
                legal@hypercerts.org
              </a>
            </p>
            <p className="mt-4">Communications may be submitted in English.</p>
            <p className="mt-4">
              The same address serves as the point of contact for recipients of the service in
              accordance with Article 12 of the DSA.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              5. Notice-and-action procedure
            </h2>
            <p>
              Any individual or entity may notify the Hypercerts Foundation of the presence of
              specific items of information that the notifier considers to be illegal content, in
              accordance with Article 16 of the DSA.
            </p>

            <h3 className="font-mono text-lg text-navy mt-6 mb-3">
              How to submit a notice
            </h3>
            <p>Notices should be sent to:</p>
            <p className="mt-2">
              <a
                href="mailto:legal@hypercerts.org"
                className="text-blue-600 underline hover:text-blue-800"
              >
                legal@hypercerts.org
              </a>
            </p>
            <p className="mt-4">
              To enable effective processing, a notice should include:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>
                a sufficiently substantiated explanation of why the content is considered illegal
              </li>
              <li>
                a clear indication of the exact electronic location of the content (for example
                URL, DID, or record identifier)
              </li>
              <li>the name and email address of the notifier</li>
              <li>
                a statement confirming the notifier&apos;s good-faith belief that the information
                and allegations contained in the notice are accurate and complete
              </li>
            </ul>

            <h3 className="font-mono text-lg text-navy mt-6 mb-3">
              How we process notices
            </h3>
            <p>Upon receipt of a notice, the Hypercerts Foundation will:</p>
            <ol className="list-decimal pl-6 mt-2 space-y-2">
              <li>
                Send an acknowledgment of receipt to the notifier without undue delay.
              </li>
              <li>
                Process the notice in a timely, diligent, non-arbitrary, and objective manner.
              </li>
              <li>
                Where the notice contains sufficient information to allow identification of the
                content and an assessment of its illegality, take appropriate action. This may
                include restricting access to specific data or suspending an account.
              </li>
              <li>
                Notify the affected user of any action taken, including the reasons for the
                decision and available remedies.
              </li>
              <li>Inform the notifier of the outcome of the notice.</li>
            </ol>
            <p className="mt-4">Decisions are made on the basis of applicable law.</p>
            <p className="mt-4">
              The Hypercerts Foundation does not routinely monitor the information stored on
              Personal Data Servers and has{" "}
              <strong>no general obligation to monitor information</strong> stored through the
              services in accordance with Article 8 of the Digital Services Act.
            </p>
            <p className="mt-4">
              The Hypercerts Foundation may take appropriate measures to address{" "}
              <strong>
                manifestly unfounded notices or repeated abusive submissions
              </strong>
              , including limiting the ability of the notifier to submit future notices where
              permitted by applicable law.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              6. Content restrictions
            </h2>
            <p>
              As described in the{" "}
              <a href="/terms" className="text-blue-600 underline hover:text-blue-800">
                Terms of Service
              </a>
              , the Hypercerts Foundation may restrict access to content or suspend accounts in
              the following circumstances:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>
                to comply with legal obligations or respond to valid legal orders
              </li>
              <li>to protect the stability or security of the infrastructure</li>
              <li>to address clearly unlawful content when required by law</li>
              <li>
                in response to a valid notice submitted under this procedure
              </li>
            </ul>
            <p className="mt-4">
              Certified operates as infrastructure within a federated network architecture.
              Content stored through Personal Data Servers may be replicated, cached, indexed, or
              displayed by independent servers or applications outside the control of the
              Hypercerts Foundation.
            </p>
            <p className="mt-4">
              The Hypercerts Foundation does not apply editorial content policies, operate
              recommendation systems, or curate user content. Certified is infrastructure, not a
              social media platform.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              7. Statement of reasons
            </h2>
            <p>
              In accordance with Article 17 of the DSA, when the Hypercerts Foundation restricts
              access to content or suspends an account, it will provide the affected user with a
              clear and specific statement of reasons, including:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>
                the facts and circumstances relied on in making the decision
              </li>
              <li>the legal or contractual basis for the decision</li>
              <li>
                information about the notice, if the decision was based on one
              </li>
              <li>
                information about the right to seek redress, including any available internal
                complaint mechanism
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              8. Internal complaint-handling
            </h2>
            <p>
              In accordance with Article 20 of the DSA, users who are affected by a content
              restriction or account suspension decision may submit a complaint to:
            </p>
            <p className="mt-4">
              <a
                href="mailto:legal@hypercerts.org"
                className="text-blue-600 underline hover:text-blue-800"
              >
                legal@hypercerts.org
              </a>
            </p>
            <p className="mt-4">
              Complaints will be processed in a timely and non-discriminatory manner. Users will
              be informed of the outcome and the reasoning behind the decision.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              9. Trusted flaggers
            </h2>
            <p>
              Where the Hypercerts Foundation receives notices from entities designated as{" "}
              <strong>trusted flaggers</strong> under Article 22 of the Digital Services Act, such
              notices will be prioritized and processed without undue delay.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">10. Transparency</h2>
            <p>
              The Hypercerts Foundation will publish{" "}
              <strong>annual transparency reports</strong> in accordance with Article 15 of the
              DSA, including information on:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>
                the number of orders received from EU member state authorities
              </li>
              <li>the number of notices received and actions taken</li>
              <li>
                any content moderation activity undertaken on its own initiative
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">11. Limitation</h2>
            <p>
              The Hypercerts Foundation is not responsible for content moderation decisions made by
              third-party applications that access data through the AT Protocol.
            </p>
            <p className="mt-4">
              Moderation policies applied by other services are outside our control and do not
              reflect actions taken by the Hypercerts Foundation.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
