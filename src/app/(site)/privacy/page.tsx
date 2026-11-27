import { PageHeader } from "@/components/page-title";
import { pageMetadata } from "@/lib/seo";

export const ensureStatic = "prefetch";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "Privacy Policy for Certified, the identity platform operated by the Hypercerts Foundation. Covers data processing, GDPR compliance, cookies, and your rights.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <article className="page legal-page">
      <PageHeader title="Privacy Policy" description="Last updated: November 10, 2026" />

      <nav aria-label="Contents" className="legal-toc">
        <ol>
          <li>
            <a href="#introduction" className="legal-link">
              1. Introduction
            </a>
          </li>
          <li>
            <a href="#data-controller" className="legal-link">
              2. Data controller
            </a>
          </li>
          <li>
            <a href="#personal-data-we-process" className="legal-link">
              3. Personal data we process
            </a>
          </li>
          <li>
            <a href="#how-we-use-personal-data" className="legal-link">
              4. How we use personal data
            </a>
          </li>
          <li>
            <a href="#legal-basis-for-processing" className="legal-link">
              5. Legal basis for processing
            </a>
          </li>
          <li>
            <a href="#data-storage-and-infrastructure" className="legal-link">
              6. Data storage and infrastructure
            </a>
          </li>
          <li>
            <a href="#federated-network-architecture" className="legal-link">
              7. Federated network architecture
            </a>
          </li>
          <li>
            <a href="#data-sharing" className="legal-link">
              8. Data sharing
            </a>
          </li>
          <li>
            <a href="#cookies-and-tracking-technologies" className="legal-link">
              9. Cookies and tracking technologies
            </a>
          </li>
          <li>
            <a href="#data-retention" className="legal-link">
              10. Data retention
            </a>
          </li>
          <li>
            <a href="#security" className="legal-link">
              11. Security
            </a>
          </li>
          <li>
            <a href="#childrens-data" className="legal-link">
              12. Children&apos;s data
            </a>
          </li>
          <li>
            <a href="#your-rights" className="legal-link">
              13. Your rights
            </a>
          </li>
          <li>
            <a href="#international-users" className="legal-link">
              14. International users
            </a>
          </li>
          <li>
            <a href="#changes-to-this-policy" className="legal-link">
              15. Changes to this policy
            </a>
          </li>
          <li>
            <a href="#contact" className="legal-link">
              16. Contact
            </a>
          </li>
        </ol>
      </nav>

      <div className="legal-prose">
        <section>
          <h2 id="introduction">1. Introduction</h2>
          <p>
            This Privacy Policy explains how the Hypercerts Foundation (&ldquo;Hypercerts
            Foundation&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) processes
            personal data in connection with the Certified services.
          </p>
          <p>Certified consists of:</p>
          <ul>
            <li>
              <strong>certified.app</strong> – a web application used to create and manage AT
              Protocol identities and configure related services
            </li>
            <li>
              <strong>certified.one</strong> – infrastructure operating AT Protocol Personal Data
              Servers (PDS)
            </li>
          </ul>
          <p>
            The Hypercerts Foundation operates these services as identity and data hosting
            infrastructure for the AT Protocol ecosystem.
          </p>
          <p>This Privacy Policy explains:</p>
          <ul>
            <li>what personal data we process</li>
            <li>how we use that data</li>
            <li>how data is stored and shared</li>
            <li>your rights under applicable data protection laws</li>
          </ul>
        </section>

        <section>
          <h2 id="data-controller">2. Data controller</h2>
          <p>
            For the purposes of the EU General Data Protection Regulation (GDPR), the data
            controller is:
          </p>
          <p>
            <strong>Hypercerts Foundation</strong>
            <br />
            1209 Orange St.
            <br />
            Wilmington, DE 19801
            <br />
            United States
          </p>
          <p>
            Phone: +1 302 658 7581
            <br />
            Contact:{" "}
            <a href="mailto:legal@hypercerts.org" className="legal-link">
              legal@hypercerts.org
            </a>
          </p>
          <p>
            For data stored on Personal Data Servers, the Hypercerts Foundation acts as an{" "}
            <strong>
              infrastructure provider operating the server environment in which user-controlled data
              is stored
            </strong>
            .
          </p>

          <h3>EU representative</h3>
          <p>
            In accordance with Article 27 of the GDPR, the Hypercerts Foundation has designated the
            following representative in the European Union:
          </p>
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
            <a href="mailto:legal@hypercerts.org" className="legal-link">
              legal@hypercerts.org
            </a>
          </p>
        </section>

        <section>
          <h2 id="personal-data-we-process">3. Personal data we process</h2>
          <p>The personal data processed by Certified depends on how you use the services.</p>

          <h3>Account information</h3>
          <p>When you create or manage an account using certified.app, we may process:</p>
          <ul>
            <li>email address</li>
            <li>account identifiers</li>
            <li>authentication information</li>
            <li>configuration settings for your AT Protocol identity</li>
          </ul>

          <h3>Signing in with Google</h3>
          <p>
            Signing in with Google is optional. You can always sign in with a one-time code sent to
            your email address instead. If you choose to sign in with Google, Google shares the
            following with us:
          </p>
          <ul>
            <li>your email address, and whether Google has verified it</li>
            <li>your name and profile picture</li>
            <li>an identifier for your Google account</li>
          </ul>
          <p>
            We use your verified email address to sign you in to the Certified account for that
            address, or to create one if none exists. We do not receive your Google password.
          </p>

          <h3>Data stored on Personal Data Servers</h3>
          <p>
            certified.one operates Personal Data Servers that store records associated with AT
            Protocol identities.
          </p>
          <p>These records may include:</p>
          <ul>
            <li>profile information</li>
            <li>user-generated content</li>
            <li>references to external resources</li>
            <li>metadata associated with AT Protocol records</li>
          </ul>
          <p>
            This data is stored at the direction of users and may contain personal data depending on
            how the user uses the service.
          </p>

          <h3>Technical and operational data</h3>
          <p>To operate the services, we may process:</p>
          <ul>
            <li>IP addresses</li>
            <li>system logs</li>
            <li>device or browser information</li>
            <li>timestamps of service interactions</li>
            <li>security and abuse-prevention signals</li>
          </ul>
          <p>
            System logs and security-related operational data may be retained for limited periods
            necessary to detect abuse, investigate incidents, and maintain service reliability.
          </p>
        </section>

        <section>
          <h2 id="how-we-use-personal-data">4. How we use personal data</h2>
          <p>We process personal data only where necessary for the operation of the services.</p>
          <p>This may include processing necessary to:</p>
          <ul>
            <li>operate and maintain certified.app and certified.one</li>
            <li>authenticate users and manage accounts</li>
            <li>
              send service-related notifications such as authentication, account, and security
              communications
            </li>
            <li>operate AT Protocol Personal Data Servers</li>
            <li>ensure the stability and security of the infrastructure</li>
            <li>detect and prevent abuse or malicious activity</li>
            <li>comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 id="legal-basis-for-processing">5. Legal basis for processing</h2>
          <p>Where the GDPR applies, personal data is processed on the following legal bases:</p>

          <h3>Contractual necessity</h3>
          <p>Processing necessary to provide the services requested by the user.</p>

          <h3>Legitimate interests</h3>
          <p>Processing necessary to:</p>
          <ul>
            <li>maintain service security</li>
            <li>prevent abuse</li>
            <li>operate and improve infrastructure</li>
            <li>ensure reliable system performance</li>
          </ul>

          <h3>Legal obligations</h3>
          <p>Processing required to comply with applicable laws or regulatory requirements.</p>

          <h3>Consent</h3>
          <p>
            Where applicable, certain processing may be based on your consent. Where consent is the
            legal basis, you have the right to withdraw consent at any time. Withdrawal of consent
            does not affect the lawfulness of processing carried out before the withdrawal.
          </p>
        </section>

        <section>
          <h2 id="data-storage-and-infrastructure">6. Data storage and infrastructure</h2>
          <p>
            The infrastructure supporting certified.app and certified.one Personal Data Servers is
            currently hosted on cloud infrastructure located within the{" "}
            <strong>European Union</strong>.
          </p>
          <p>
            Some operational service providers process limited data outside the European Union.
            Specifically, transactional email delivery is handled by a US-based provider (see
            Section 8), and certain corporate operations of our hosting providers may take place in
            the United States. Where personal data is transferred outside the European Union,
            transfers are protected by Standard Contractual Clauses (SCCs) approved by the European
            Commission, in accordance with Article 46 GDPR.
          </p>
        </section>

        <section>
          <h2 id="federated-network-architecture">7. Federated network architecture</h2>
          <p>
            Certified operates within the <strong>AT Protocol</strong>, a federated network
            architecture.
          </p>
          <p>
            When users publish records through their Personal Data Server, those records may be:
          </p>
          <ul>
            <li>replicated</li>
            <li>cached</li>
            <li>indexed</li>
            <li>displayed</li>
          </ul>
          <p>by independent servers or applications participating in the network.</p>
          <p>
            Once data is shared through the federated network, the Hypercerts Foundation cannot
            control how third-party services process or store that information. The legal status of
            those operators under data protection law depends on their specific activities; in many
            cases they will themselves be <strong>data controllers</strong> for their own
            processing.
          </p>
        </section>

        <section>
          <h2 id="data-sharing">8. Data sharing</h2>
          <p>We do not sell personal data.</p>
          <p>Personal data may be shared only in limited circumstances, including:</p>
          <ul>
            <li>
              with service providers that support the operation of the services and process data on
              our behalf, including:
              <ul>
                <li>Vercel Inc. (web application hosting and anonymous web analytics)</li>
                <li>Railway Corporation (application and database hosting infrastructure)</li>
                <li>Upstash, Inc. (session and authentication data storage)</li>
                <li>
                  Plus Five Five, Inc. (d/b/a Resend) (transactional email delivery for account,
                  security, and operational notifications)
                </li>
              </ul>
            </li>
            <li>with third-party services that users choose to connect to their accounts</li>
            <li>
              with Google LLC, if you choose to sign in with Google. Google then learns that you are
              signing in to Certified. Google processes this as an independent controller under its
              own{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                privacy policy
              </a>
              .
            </li>
            <li>where required by law or legal process</li>
            <li>where necessary to protect the security or integrity of the services</li>
          </ul>
        </section>

        <section>
          <h2 id="cookies-and-tracking-technologies">9. Cookies and tracking technologies</h2>
          <p>
            certified.app uses only cookies that are strictly necessary for the operation of the
            service, such as session management and authentication.
          </p>
          <p>
            We do not use advertising cookies, third-party tracking pixels, or analytics cookies
            that track individual users across websites.
          </p>
          <p>
            We use Vercel Web Analytics to collect aggregated usage data such as page views,
            referrer information, and general device or browser type. Vercel Web Analytics does not
            use cookies and does not store persistent identifiers in your browser. Instead, it
            derives an ephemeral session identifier by hashing request metadata (including the IP
            address and user agent). These hashes are retained for no longer than 24 hours and are
            not used to track individuals across sessions, websites, or applications.
          </p>
          <p>
            The legal basis for this processing is our legitimate interest under Article 6(1)(f)
            GDPR in understanding aggregate usage of the service to maintain, secure, and improve
            it. You have the right to object to this processing on grounds relating to your
            particular situation (see Section 13).
          </p>
          <p>
            This data is processed by Vercel Inc. (United States) under Standard Contractual Clauses
            (SCCs) as the legal mechanism for international data transfers.
          </p>
          <p>
            If our use of cookies or analytics changes in the future, we will update this policy and
            provide appropriate notice and controls.
          </p>
        </section>

        <section>
          <h2 id="data-retention">10. Data retention</h2>
          <p>
            We retain personal data only for as long as necessary to operate the services and
            fulfill legal obligations.
          </p>
          <p>
            Retention periods may vary depending on the type of data and applicable legal
            obligations.
          </p>
          <p>
            To delete your account, contact us at{" "}
            <a href="mailto:support@hypercerts.org" className="legal-link">
              support@hypercerts.org
            </a>
            . We will delete account-related data from our infrastructure within a reasonable
            period, subject to:
          </p>
          <ul>
            <li>legal retention requirements</li>
            <li>system backups</li>
            <li>technical limitations related to federated data replication</li>
          </ul>
          <p>
            As described above, data previously shared through the AT Protocol network may continue
            to exist on third-party systems.
          </p>
        </section>

        <section>
          <h2 id="security">11. Security</h2>
          <p>
            We implement reasonable technical and organizational measures to protect the security of
            the services and the data stored on them.
          </p>
          <p>
            However, no system can guarantee complete security. Users are responsible for protecting
            their account credentials and cryptographic keys associated with their AT Protocol
            identities.
          </p>
        </section>

        <section>
          <h2 id="childrens-data">12. Children&apos;s data</h2>
          <p>
            The services are not directed at individuals under the age of 16. The Hypercerts
            Foundation does not knowingly collect personal data from individuals under 16 years of
            age, or under the minimum age required to consent to data processing under applicable
            law in the user&apos;s jurisdiction.
          </p>
          <p>
            If we become aware that personal data has been collected from an individual under the
            applicable minimum age without appropriate authorization, we will take steps to delete
            that data.
          </p>
        </section>

        <section>
          <h2 id="your-rights">13. Your rights</h2>
          <p>
            Where applicable under data protection laws such as the GDPR, individuals may have the
            right to:
          </p>
          <ul>
            <li>access their personal data</li>
            <li>request correction of inaccurate data</li>
            <li>request deletion of personal data</li>
            <li>restrict or object to certain types of processing</li>
            <li>request portability of data they have provided</li>
            <li>withdraw consent, where processing is based on consent</li>
            <li>lodge a complaint with a data protection supervisory authority</li>
          </ul>
          <p>
            You may lodge a complaint with the supervisory authority in the EU Member State of your
            habitual residence, place of work, or the place of the alleged infringement. Where our
            EU representative is established (Berlin, Germany), the competent authority is the
            Berliner Beauftragte für Datenschutz und Informationsfreiheit (BlnBDI),{" "}
            <a
              href="https://www.datenschutz-berlin.de"
              target="_blank"
              rel="noopener noreferrer"
              className="legal-link"
            >
              https://www.datenschutz-berlin.de
            </a>
            .
          </p>
          <p>Requests may be submitted to:</p>
          <p>
            <a href="mailto:legal@hypercerts.org" className="legal-link">
              legal@hypercerts.org
            </a>
          </p>
          <p>
            We will respond to requests within one month, or inform you if an extension is necessary
            in accordance with applicable law.
          </p>
        </section>

        <section>
          <h2 id="international-users">14. International users</h2>
          <p>
            Certified is operated from infrastructure located primarily within the European Union
            but may be accessed globally.
          </p>
          <p>
            If you access the services from outside the European Union, your data may be processed
            in jurisdictions outside your country of residence, subject to the safeguards described
            in Section 6.
          </p>
        </section>

        <section>
          <h2 id="changes-to-this-policy">15. Changes to this policy</h2>
          <p>We may update this Privacy Policy from time to time.</p>
          <p>
            When changes are material, we will provide notice through certified.app or other
            appropriate communication channels.
          </p>
          <p>
            The most recent version of this policy will always be available on the Certified
            website.
          </p>
        </section>

        <section>
          <h2 id="contact">16. Contact</h2>
          <p>
            For privacy inquiries, data protection requests, or questions about this policy,
            contact:
          </p>
          <p>
            <strong>Hypercerts Foundation</strong>
            <br />
            1209 Orange St.
            <br />
            Wilmington, DE 19801
            <br />
            United States
          </p>
          <p>
            Phone: +1 302 658 7581
            <br />
            Email:{" "}
            <a href="mailto:legal@hypercerts.org" className="legal-link">
              legal@hypercerts.org
            </a>
          </p>
        </section>
      </div>
    </article>
  );
}
