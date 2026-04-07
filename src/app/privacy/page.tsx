import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for Certified, the identity platform operated by the Hypercerts Foundation. Covers data processing, GDPR compliance, cookies, and your rights.",
  alternates: { canonical: "https://certified.app/privacy" },
  openGraph: {
    title: "Privacy Policy — Certified",
    description:
      "Privacy Policy for Certified, the identity platform operated by the Hypercerts Foundation.",
    url: "https://certified.app/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return (
    <div className="app-page">
      <div className="app-page__inner max-w-3xl">
        <h1 className="font-mono text-h1 text-navy tracking-tight mb-8">
          Privacy Policy — Certified
        </h1>

        <p className="text-sm text-gray-500 mb-8">Last updated: April 1, 2026</p>

        <div className="prose prose-navy max-w-none space-y-8">
          <section>
            <h2 className="font-mono text-xl text-navy mb-4">1. Introduction</h2>
            <p>
              This Privacy Policy explains how the Hypercerts Foundation (&quot;Hypercerts
              Foundation&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) processes
              personal data in connection with the Certified services.
            </p>
            <p className="mt-4">Certified consists of:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>
                <strong>certified.app</strong> – a web application used to create and manage AT
                Protocol identities and configure related services
              </li>
              <li>
                <strong>certified.one</strong> – infrastructure operating AT Protocol Personal Data
                Servers (PDS)
              </li>
            </ul>
            <p className="mt-4">
              The Hypercerts Foundation operates these services as identity and data hosting
              infrastructure for the AT Protocol ecosystem.
            </p>
            <p className="mt-4">This Privacy Policy explains:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>what personal data we process</li>
              <li>how we use that data</li>
              <li>how data is stored and shared</li>
              <li>your rights under applicable data protection laws</li>
            </ul>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">2. Data controller</h2>
            <p>
              For the purposes of the EU General Data Protection Regulation (GDPR), the data
              controller is:
            </p>
            <p className="mt-4">
              <strong>Hypercerts Foundation</strong>
              <br />
              1209 Orange St.
              <br />
              Wilmington, DE 19801
              <br />
              United States
            </p>
            <p className="mt-4">
              Phone: +1 302 658 7581
              <br />
              Contact:{" "}
              <a
                href="mailto:legal@hypercerts.org"
                className="text-blue-600 underline hover:text-blue-800"
              >
                legal@hypercerts.org
              </a>
            </p>
            <p className="mt-4">
              For data stored on Personal Data Servers, the Hypercerts Foundation acts as an{" "}
              <strong>
                infrastructure provider operating the server environment in which user-controlled
                data is stored
              </strong>
              .
            </p>

            <h3 className="font-mono text-lg text-navy mt-6 mb-3">EU representative</h3>
            <p>
              In accordance with Article 27 of the GDPR, the Hypercerts Foundation has designated
              the following representative in the European Union:
            </p>
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
              3. Personal data we process
            </h2>
            <p>
              The personal data processed by Certified depends on how you use the services.
            </p>

            <h3 className="font-mono text-lg text-navy mt-6 mb-3">Account information</h3>
            <p>
              When you create or manage an account using certified.app, we may process:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>email address</li>
              <li>account identifiers</li>
              <li>authentication information</li>
              <li>configuration settings for your AT Protocol identity</li>
            </ul>

            <h3 className="font-mono text-lg text-navy mt-6 mb-3">
              Data stored on Personal Data Servers
            </h3>
            <p>
              certified.one operates Personal Data Servers that store records associated with AT
              Protocol identities.
            </p>
            <p className="mt-4">These records may include:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>profile information</li>
              <li>user-generated content</li>
              <li>references to external resources</li>
              <li>metadata associated with AT Protocol records</li>
            </ul>
            <p className="mt-4">
              This data is stored at the direction of users and may contain personal data depending
              on how the user uses the service.
            </p>

            <h3 className="font-mono text-lg text-navy mt-6 mb-3">
              Technical and operational data
            </h3>
            <p>To operate the services, we may process:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>IP addresses</li>
              <li>system logs</li>
              <li>device or browser information</li>
              <li>timestamps of service interactions</li>
              <li>security and abuse-prevention signals</li>
            </ul>
            <p className="mt-4">
              System logs and security-related operational data may be retained for limited periods
              necessary to detect abuse, investigate incidents, and maintain service reliability.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              4. How we use personal data
            </h2>
            <p>
              We process personal data only where necessary for the operation of the services.
            </p>
            <p className="mt-4">This may include processing necessary to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>operate and maintain certified.app and certified.one</li>
              <li>authenticate users and manage accounts</li>
              <li>operate AT Protocol Personal Data Servers</li>
              <li>ensure the stability and security of the infrastructure</li>
              <li>detect and prevent abuse or malicious activity</li>
              <li>comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              5. Legal basis for processing
            </h2>
            <p>
              Where the GDPR applies, personal data is processed on the following legal bases:
            </p>

            <h3 className="font-mono text-lg text-navy mt-6 mb-3">Contractual necessity</h3>
            <p>Processing necessary to provide the services requested by the user.</p>

            <h3 className="font-mono text-lg text-navy mt-6 mb-3">Legitimate interests</h3>
            <p>Processing necessary to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>maintain service security</li>
              <li>prevent abuse</li>
              <li>operate and improve infrastructure</li>
              <li>ensure reliable system performance</li>
            </ul>

            <h3 className="font-mono text-lg text-navy mt-6 mb-3">Legal obligations</h3>
            <p>
              Processing required to comply with applicable laws or regulatory requirements.
            </p>

            <h3 className="font-mono text-lg text-navy mt-6 mb-3">Consent</h3>
            <p>
              Where applicable, certain processing may be based on your consent. Where consent is
              the legal basis, you have the right to withdraw consent at any time. Withdrawal of
              consent does not affect the lawfulness of processing carried out before the
              withdrawal.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              6. Data storage and infrastructure
            </h2>
            <p>
              The infrastructure supporting certified.one Personal Data Servers is currently hosted
              on cloud infrastructure located within the{" "}
              <strong>European Union</strong>.
            </p>
            <p className="mt-4">
              Operational service providers may process limited data outside the European Union.
              Where this occurs, appropriate safeguards are implemented in accordance with
              applicable data protection laws.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              7. Federated network architecture
            </h2>
            <p>
              Certified operates within the <strong>AT Protocol</strong>, a federated network
              architecture.
            </p>
            <p className="mt-4">
              When users publish records through their Personal Data Server, those records may be:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>replicated</li>
              <li>cached</li>
              <li>indexed</li>
              <li>displayed</li>
            </ul>
            <p className="mt-4">
              by independent servers or applications participating in the network.
            </p>
            <p className="mt-4">
              Once data is shared through the federated network, the Hypercerts Foundation cannot
              control how third-party services process or store that information. Those services act
              as <strong>independent data controllers</strong> for any processing they perform.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">8. Data sharing</h2>
            <p>We do not sell personal data.</p>
            <p className="mt-4">
              Personal data may be shared only in limited circumstances, including:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>
                with service providers that support the operation of the services and process data
                on our behalf, including Vercel Inc. (hosting and anonymous web analytics)
              </li>
              <li>
                with third-party services that users choose to connect to their accounts
              </li>
              <li>where required by law or legal process</li>
              <li>
                where necessary to protect the security or integrity of the services
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              9. Cookies and tracking technologies
            </h2>
            <p>
              certified.app uses only cookies that are strictly necessary for the operation of the
              service, such as session management and authentication.
            </p>
            <p className="mt-4">
              We do not use advertising cookies, third-party tracking pixels, or analytics cookies
              that track individual users across websites.
            </p>
            <p className="mt-4">
              We use Vercel Web Analytics to collect anonymous, aggregated usage data such as page
              views, referrer information, and general device or browser type. Vercel Web Analytics
              does not use cookies and does not collect personal data or track individual users.
              This data is processed by Vercel Inc. (US) under Standard Contractual Clauses (SCCs)
              as the legal mechanism for international data transfers.
            </p>
            <p className="mt-4">
              If our use of cookies or analytics changes in the future, we will update this policy
              and provide appropriate notice and controls.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">10. Data retention</h2>
            <p>
              We retain personal data only for as long as necessary to operate the services and
              fulfill legal obligations.
            </p>
            <p className="mt-4">
              Retention periods may vary depending on the type of data and applicable legal
              obligations.
            </p>
            <p className="mt-4">
              To delete your account, contact us at{" "}
              <a
                href="mailto:support@hypercerts.org"
                className="text-blue-600 underline hover:text-blue-800"
              >
                support@hypercerts.org
              </a>
              . We will delete account-related data from our infrastructure
              within a reasonable period, subject to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>legal retention requirements</li>
              <li>system backups</li>
              <li>technical limitations related to federated data replication</li>
            </ul>
            <p className="mt-4">
              As described above, data previously shared through the AT Protocol network may
              continue to exist on third-party systems.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">11. Security</h2>
            <p>
              We implement reasonable technical and organizational measures to protect the security
              of the services and the data stored on them.
            </p>
            <p className="mt-4">
              However, no system can guarantee complete security. Users are responsible for
              protecting their account credentials and cryptographic keys associated with their AT
              Protocol identities.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              12. Children&apos;s data
            </h2>
            <p>
              The services are not directed at individuals under the age of 16. The Hypercerts
              Foundation does not knowingly collect personal data from individuals under 16 years of
              age, or under the minimum age required to consent to data processing under applicable
              law in the user&apos;s jurisdiction.
            </p>
            <p className="mt-4">
              If we become aware that personal data has been collected from an individual under the
              applicable minimum age without appropriate authorization, we will take steps to delete
              that data.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">13. Your rights</h2>
            <p>
              Where applicable under data protection laws such as the GDPR, individuals may have
              the right to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>access their personal data</li>
              <li>request correction of inaccurate data</li>
              <li>request deletion of personal data</li>
              <li>restrict or object to certain types of processing</li>
              <li>request portability of data they have provided</li>
              <li>withdraw consent, where processing is based on consent</li>
            </ul>
            <p className="mt-4">Requests may be submitted to:</p>
            <p className="mt-2">
              <a
                href="mailto:legal@hypercerts.org"
                className="text-blue-600 underline hover:text-blue-800"
              >
                legal@hypercerts.org
              </a>
            </p>
            <p className="mt-4">
              We will respond to requests within one month, or inform you if an extension is
              necessary in accordance with applicable law.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              14. International users
            </h2>
            <p>
              Certified is operated from infrastructure located primarily within the European Union
              but may be accessed globally.
            </p>
            <p className="mt-4">
              If you access the services from outside the European Union, your data may be processed
              in jurisdictions outside your country of residence, subject to the safeguards
              described in Section 6.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              15. Changes to this policy
            </h2>
            <p>We may update this Privacy Policy from time to time.</p>
            <p className="mt-4">
              When changes are material, we will provide notice through certified.app or other
              appropriate communication channels.
            </p>
            <p className="mt-4">
              The most recent version of this policy will always be available on the Certified
              website.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">16. Contact</h2>
            <p>
              For privacy inquiries, data protection requests, or questions about this policy,
              contact:
            </p>
            <p className="mt-4">
              <strong>Hypercerts Foundation</strong>
              <br />
              1209 Orange St.
              <br />
              Wilmington, DE 19801
              <br />
              United States
            </p>
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
        </div>
      </div>
    </div>
  );
}
