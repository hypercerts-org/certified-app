import type { Metadata } from "next";
import Link from "next/link";
import LandingTopBar from "@/components/landing/landing-topbar";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for Certified, the identity platform operated by the Hypercerts Foundation. Covers account usage, data ownership, AT Protocol identity, and acceptable use.",
  alternates: { canonical: "https://certified.app/terms" },
  openGraph: {
    title: "Terms of Service — Certified",
    description:
      "Terms of Service for Certified, the identity platform operated by the Hypercerts Foundation.",
    url: "https://certified.app/terms",
    type: "website",
    images: [{ url: "/assets/certs-hero-1200x630.png", width: 1200, height: 630, alt: "Certified — One account. Your work. Recognized everywhere." }],
  },
};

export default function TermsPage() {
  return (
    <div className="app-page legal-page">
      <LandingTopBar />
      <div className="app-page__inner">
        <h1 className="font-headline text-h1 text-[var(--fg-primary)] tracking-tight mb-8">
          Terms of Service
        </h1>

        <p className="text-sm text-[var(--fg-muted)] mb-8">Last updated: May 6, 2026</p>

        <nav aria-label="Contents" className="legal-toc mb-8">
          <ol>
            <li>
              <a href="#about-certified" className="legal-link">
                1. About Certified
              </a>
            </li>
            <li>
              <a href="#nature-of-the-services" className="legal-link">
                2. Nature of the services
              </a>
            </li>
            <li>
              <a href="#agreement-to-these-terms" className="legal-link">
                3. Agreement to these Terms
              </a>
            </li>
            <li>
              <a href="#at-protocol-identity-and-user-responsibility" className="legal-link">
                4. AT Protocol identity and user responsibility
              </a>
            </li>
            <li>
              <a href="#group-and-organization-accounts" className="legal-link">
                5. Group and organization accounts
              </a>
            </li>
            <li>
              <a href="#intellectual-property" className="legal-link">
                6. Intellectual property
              </a>
            </li>
            <li>
              <a href="#acceptable-use" className="legal-link">
                7. Acceptable use
              </a>
            </li>
            <li>
              <a href="#infrastructure-and-service-operation" className="legal-link">
                8. Infrastructure and service operation
              </a>
            </li>
            <li>
              <a href="#third-party-services" className="legal-link">
                9. Third-party services
              </a>
            </li>
            <li>
              <a href="#privacy-and-data-protection" className="legal-link">
                10. Privacy and data protection
              </a>
            </li>
            <li>
              <a href="#handling-unlawful-data-and-legal-orders" className="legal-link">
                11. Handling unlawful data and legal orders
              </a>
            </li>
            <li>
              <a href="#availability-modification-and-discontinuation" className="legal-link">
                12. Availability, modification, and discontinuation
              </a>
            </li>
            <li>
              <a href="#data-persistence-in-federated-systems" className="legal-link">
                13. Data persistence in federated systems
              </a>
            </li>
            <li>
              <a href="#account-security" className="legal-link">
                14. Account security
              </a>
            </li>
            <li>
              <a href="#termination" className="legal-link">
                15. Termination
              </a>
            </li>
            <li>
              <a href="#feedback" className="legal-link">
                16. Feedback
              </a>
            </li>
            <li>
              <a href="#disclaimer-of-warranties" className="legal-link">
                17. Disclaimer of warranties
              </a>
            </li>
            <li>
              <a href="#limitation-of-liability" className="legal-link">
                18. Limitation of liability
              </a>
            </li>
            <li>
              <a href="#indemnification" className="legal-link">
                19. Indemnification
              </a>
            </li>
            <li>
              <a href="#consumer-protections" className="legal-link">
                20. Consumer protections
              </a>
            </li>
            <li>
              <a href="#validity-and-waiver" className="legal-link">
                21. Validity and waiver
              </a>
            </li>
            <li>
              <a href="#changes-to-these-terms" className="legal-link">
                22. Changes to these Terms
              </a>
            </li>
            <li>
              <a href="#transfer-of-rights" className="legal-link">
                23. Transfer of rights
              </a>
            </li>
            <li>
              <a href="#governing-law" className="legal-link">
                24. Governing law
              </a>
            </li>
            <li>
              <a href="#entire-agreement" className="legal-link">
                25. Entire agreement
              </a>
            </li>
            <li>
              <a href="#contact" className="legal-link">
                26. Contact
              </a>
            </li>
          </ol>
        </nav>

        <div className="legal-prose space-y-8">
          <section>
            <h2 id="about-certified" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">1. About Certified</h2>
            <p>
              Certified is operated by the Hypercerts Foundation (&quot;Hypercerts
              Foundation&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), a Delaware
              nonstock corporation that develops and maintains open infrastructure for the
              hypercerts ecosystem.
            </p>
            <p className="mt-4">The Certified services consist of two components:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>
                <strong>certified.app</strong> – a web application used to create and manage AT
                Protocol identities and configure related services.
              </li>
              <li>
                <strong>certified.one</strong> – infrastructure that operates AT Protocol Personal
                Data Servers (PDS) that store and serve identity records and associated user data.
              </li>
            </ul>
            <p className="mt-4">
              These services provide identity and data hosting infrastructure for the AT Protocol
              ecosystem.
            </p>
            <p className="mt-4">
              Certified is not a social media platform. We do not operate feeds, rank content,
              recommend posts, or curate speech. Applications that display or process user data are
              operated independently by third parties.
            </p>
          </section>

          <section>
            <h2 id="nature-of-the-services" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              2. Nature of the services
            </h2>
            <p>
              Certified is part of an evolving technical ecosystem built on the AT Protocol, an
              open and developing standard.
            </p>
            <p className="mt-4">
              Features, interoperability, and functionality may change as the protocol evolves. The
              Hypercerts Foundation does not guarantee that the services will remain compatible with
              all future versions or implementations of the protocol.
            </p>
            <p className="mt-4">
              The services are provided as technical infrastructure for identity and data hosting,
              not as a platform for transactions or agreements between users.
            </p>
            <p className="mt-4">
              The Hypercerts Foundation is not a party to any agreements, interactions, or
              transactions between users or between users and third-party applications.
            </p>
          </section>

          <section>
            <h2 id="agreement-to-these-terms" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              3. Agreement to these Terms
            </h2>
            <p>
              By creating an account, accessing certified.app, or using certified.one, you agree to
              be bound by these Terms of Service and the Certified Privacy Policy (together, the
              &quot;Agreement&quot;).
            </p>
            <p className="mt-4">
              If you do not agree to these Terms, you may not use the services.
            </p>
            <p className="mt-4">
              You must be at least 16 years old, or the minimum age required to consent to data
              processing under applicable law in your jurisdiction.
            </p>
          </section>

          <section>
            <h2 id="at-protocol-identity-and-user-responsibility" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              4. AT Protocol identity and user responsibility
            </h2>
            <p>
              Certified provides tools and infrastructure that allow users to operate an AT Protocol
              identity.
            </p>
            <p className="mt-4">
              You retain ownership of the content, records, and data associated with your account.
              The Hypercerts Foundation does not claim ownership of user content.
            </p>
            <p className="mt-4">Users are solely responsible for:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>all data stored through their Personal Data Server</li>
              <li>any records published under their identity</li>
              <li>ensuring their use of the services complies with applicable laws</li>
            </ul>
            <p className="mt-4">
              You determine which applications or services may access your data.
            </p>
            <p className="mt-4">
              Because the AT Protocol operates as a federated network, data published through your
              Personal Data Server <strong>may be made available</strong> to other servers and
              applications as part of normal protocol operation. This includes replication, caching,
              indexing, and display by third-party services you interact with.
            </p>
            <p className="mt-4">
              The Hypercerts Foundation is not responsible for how third-party services process,
              display, or use such data.
            </p>
          </section>

          <section>
            <h2 id="group-and-organization-accounts" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              5. Group and organization accounts
            </h2>
            <p>
              For group or organization accounts, the users designated in the interface as
              &quot;owners&quot; (the &quot;Account Controller&quot;) manage access to the account.
              Each user is responsible for the content they create or submit. Being designated as an
              &quot;owner&quot; does not by itself make a user responsible for content created by
              other users; however, content published under a shared account is attributed to that
              account, and those who control the account may share responsibility for its use.
              Certified (operated by Hypercerts Foundation) provides hosting infrastructure only and
              is not the publisher of user content, but may remove or restrict content to comply
              with legal obligations or these Terms.
            </p>
          </section>

          <section>
            <h2 id="intellectual-property" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              6. Intellectual property
            </h2>
            <p>
              The Hypercerts Foundation retains all rights, title, and interest in the services,
              including all software, interfaces, trademarks, and other intellectual property
              associated with Certified.
            </p>
            <p className="mt-4">
              Nothing in these Terms grants you any right, title, or interest in the Hypercerts
              Foundation&apos;s intellectual property, except the{" "}
              <strong>
                limited, non-exclusive, non-transferable right to use the services in accordance
                with these Terms
              </strong>
              .
            </p>
            <p className="mt-4">
              User content remains the property of the user, as described in Section 4.
            </p>
          </section>

          <section>
            <h2 id="acceptable-use" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">7. Acceptable use</h2>
            <p>
              You may use Certified only for lawful purposes and in a manner that does not
              interfere with the operation or stability of the services.
            </p>
            <p className="mt-4">You agree not to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>use the services in violation of applicable laws or regulations</li>
              <li>attempt unauthorized access to accounts, infrastructure, or systems</li>
              <li>introduce malware or otherwise disrupt network functionality</li>
              <li>store or distribute material that is illegal to possess or transmit</li>
              <li>infringe intellectual property or privacy rights of others</li>
              <li>
                generate excessive automated traffic that disrupts or degrades the services
              </li>
              <li>conduct denial-of-service attacks or similar infrastructure abuse</li>
              <li>
                scrape, crawl, or access infrastructure in a manner that interferes with system
                performance or stability
              </li>
            </ul>
            <p className="mt-4">
              The Hypercerts Foundation may implement technical measures such as rate limiting,
              automated abuse detection, traffic filtering, or temporary access restrictions in
              order to protect the stability and security of the services.
            </p>
            <p className="mt-4">
              Where necessary to comply with law or protect infrastructure integrity, the Hypercerts
              Foundation may restrict access to certain data, limit functionality, or suspend
              accounts.
            </p>
          </section>

          <section>
            <h2 id="infrastructure-and-service-operation" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              8. Infrastructure and service operation
            </h2>
            <p>
              certified.one hosts Personal Data Servers that store AT Protocol identity records and
              related user data.
            </p>
            <p className="mt-4">
              The infrastructure supporting these servers is{" "}
              <strong>currently hosted</strong> on cloud infrastructure located within the European
              Union.
            </p>
            <p className="mt-4">
              To operate the services, we may rely on specialized third-party providers for
              operational tasks such as:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>application and database hosting</li>
              <li>system monitoring</li>
              <li>transactional email delivery</li>
              <li>analytics</li>
              <li>technical support</li>
            </ul>
            <p className="mt-4">
              Some of these providers may process limited data outside the European Union. Such
              processing occurs in accordance with applicable data protection laws and appropriate
              safeguards.
            </p>
          </section>

          <section>
            <h2 id="third-party-services" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              9. Third-party services
            </h2>
            <p>
              The services may interact with or reference third-party applications, websites, or
              services.
            </p>
            <p className="mt-4">
              These services are operated independently and governed by their own terms and
              policies. The Hypercerts Foundation does not control and is not responsible for the
              operation or content of third-party services.
            </p>
            <p className="mt-4">Your use of such services is at your own discretion.</p>
          </section>

          <section>
            <h2 id="privacy-and-data-protection" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              10. Privacy and data protection
            </h2>
            <p>
              Personal data is processed in accordance with applicable data protection laws,
              including the EU General Data Protection Regulation (GDPR) where applicable.
            </p>
            <p className="mt-4">Our Privacy Policy explains:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>what personal data we process</li>
              <li>the purposes for processing</li>
              <li>where data is stored</li>
              <li>how long it is retained</li>
              <li>the rights available to individuals</li>
            </ul>
          </section>

          <section>
            <h2 id="handling-unlawful-data-and-legal-orders" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              11. Handling unlawful data and legal orders
            </h2>
            <p>
              The Hypercerts Foundation does not routinely monitor all information stored on Personal
              Data Servers.
            </p>
            <p className="mt-4">However, we may take action where necessary to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>comply with legal obligations</li>
              <li>respond to orders from competent authorities</li>
              <li>protect the stability or security of the infrastructure</li>
              <li>address clearly unlawful data when required by law</li>
            </ul>
            <p className="mt-4">
              Such actions may include restricting access to specific records or suspending accounts.
            </p>
            <p className="mt-4">
              The Hypercerts Foundation may rely on{" "}
              <strong>automated systems or third-party services</strong> to assist in identifying or
              responding to unlawful content, infrastructure abuse, or security threats.
            </p>
            <p className="mt-4">
              The Hypercerts Foundation is not responsible for content moderation decisions made by
              third-party applications that access data through the AT Protocol. Moderation policies
              applied by other services are outside our control and do not reflect actions taken by
              the Hypercerts Foundation.
            </p>
            <p className="mt-4">
              Reports of illegal content may be submitted in accordance with the notice-and-action
              procedure described in our{" "}
              <Link href="/dsa" className="legal-link">
                DSA Compliance Page
              </Link>
              .
            </p>
            <p className="mt-4">
              Reports and legal notices may also be sent to:{" "}
              <a
                href="mailto:legal@hypercerts.org"
                className="legal-link"
              >
                legal@hypercerts.org
              </a>
            </p>
          </section>

          <section>
            <h2 id="availability-modification-and-discontinuation" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              12. Availability, modification, and discontinuation
            </h2>
            <p>Certified services are provided on a best-effort basis.</p>
            <p className="mt-4">
              Maintenance, system updates, or security work may result in temporary interruptions.
            </p>
            <p className="mt-4">
              The Hypercerts Foundation may modify, suspend, or discontinue all or part of the
              services at any time. Where reasonably possible, we will provide advance notice of
              material changes or service discontinuation.
            </p>
          </section>

          <section>
            <h2 id="data-persistence-in-federated-systems" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              13. Data persistence in federated systems
            </h2>
            <p>
              Because the AT Protocol operates as a federated network, data published through the
              services may be copied, cached, or stored by other servers or applications.
            </p>
            <p className="mt-4">
              The Hypercerts Foundation cannot guarantee that data removed from its infrastructure
              will also be removed from third-party systems.
            </p>
          </section>

          <section>
            <h2 id="account-security" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              14. Account security
            </h2>
            <p>
              You are responsible for protecting your account credentials and authentication
              information.
            </p>
            <p className="mt-4">
              If you believe your account has been compromised, you must notify us promptly at{" "}
              <a
                href="mailto:legal@hypercerts.org"
                className="legal-link"
              >
                legal@hypercerts.org
              </a>
              .
            </p>
            <p className="mt-4">
              Access to accounts may be temporarily restricted while security investigations are
              conducted.
            </p>
            <p className="mt-4">
              Because AT Protocol identities rely on cryptographic credentials, recovery of accounts
              may not be possible if credentials are permanently lost.
            </p>
          </section>

          <section>
            <h2 id="termination" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">15. Termination</h2>

            <h3 className="font-headline text-h3 text-[var(--fg-primary)] mt-6 mb-3">Termination by you</h3>
            <p>
              To delete your account, contact us at{" "}
              <a
                href="mailto:support@hypercerts.org"
                className="legal-link"
              >
                support@hypercerts.org
              </a>
              .
            </p>

            <h3 className="font-headline text-h3 text-[var(--fg-primary)] mt-6 mb-3">
              Termination by the Hypercerts Foundation
            </h3>
            <p>
              The Hypercerts Foundation may suspend or terminate your account if:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>you breach these Terms of Service</li>
              <li>
                your use of the services poses a risk to the stability, security, or integrity of
                the infrastructure
              </li>
              <li>
                we are required to do so by law or in response to a valid legal order
              </li>
              <li>the services are discontinued in accordance with Section 12</li>
            </ul>
            <p className="mt-4">
              Where reasonably possible, we will provide notice before terminating an account. In
              cases involving security threats, legal obligations, or infrastructure abuse, immediate
              action may be taken without prior notice.
            </p>

            <h3 className="font-headline text-h3 text-[var(--fg-primary)] mt-6 mb-3">
              Effect of termination
            </h3>
            <p>
              Upon termination, your access to the services will cease. The Hypercerts Foundation
              will delete your account data from its infrastructure within a reasonable period,
              subject to any legal retention obligations.
            </p>
            <p className="mt-4">
              As described in Section 13, data previously published through the AT Protocol may
              continue to exist on third-party servers or applications. The Hypercerts Foundation
              cannot ensure deletion of such data from federated systems.
            </p>

            <h3 className="font-headline text-h3 text-[var(--fg-primary)] mt-6 mb-3">Survival</h3>
            <p>
              Sections 6 (intellectual property), 13 (data persistence), 16 (feedback), 17
              (disclaimer of warranties), 18 (limitation of liability), 19 (indemnification), 20
              (consumer protections), and 24 (governing law) survive termination of these Terms.
            </p>
          </section>

          <section>
            <h2 id="feedback" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">16. Feedback</h2>
            <p>
              If you provide suggestions, ideas, or feedback regarding the services, the Hypercerts
              Foundation may use such feedback{" "}
              <strong>for any purpose, without restriction or compensation</strong>.
            </p>
          </section>

          <section>
            <h2 id="disclaimer-of-warranties" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              17. Disclaimer of warranties
            </h2>
            <p>
              The services are provided &quot;as is&quot; and &quot;as available.&quot;
            </p>
            <p className="mt-4">
              The Hypercerts Foundation makes no representations or warranties regarding the
              reliability, availability, or accuracy of the services.
            </p>
            <p className="mt-4">
              To the maximum extent permitted by law, we disclaim all warranties, express or
              implied, including warranties of merchantability, fitness for a particular purpose, and
              non-infringement.
            </p>
            <p className="mt-4">
              You understand that your use of the services is at your own discretion and risk.
            </p>
          </section>

          <section>
            <h2 id="limitation-of-liability" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              18. Limitation of liability
            </h2>
            <p>
              Nothing in these Terms limits liability where such limitation is prohibited by law.
            </p>
            <p className="mt-4">
              To the maximum extent permitted by law, the Hypercerts Foundation is not liable for
              indirect, incidental, or consequential damages arising from the use of the services.
            </p>
            <p className="mt-4">
              Where liability cannot be excluded, the Hypercerts Foundation&apos;s total liability{" "}
              <strong>arising out of or relating to the services</strong> is limited to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>
                the amount paid by you for the services during the 12 months preceding the claim, or
              </li>
              <li>USD 100, if the services were used free of charge.</li>
            </ul>
          </section>

          <section>
            <h2 id="indemnification" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              19. Indemnification
            </h2>
            <p>
              To the extent permitted by applicable law, you agree to indemnify and hold harmless
              the Hypercerts Foundation from claims, damages, losses, and expenses (including
              reasonable legal fees) arising from:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>your use of the services in violation of these Terms</li>
              <li>data you store or publish through the services</li>
              <li>your violation of applicable laws or the rights of third parties</li>
            </ul>
            <p className="mt-4">
              This indemnification obligation does not apply to consumers where prohibited by
              applicable consumer protection law.
            </p>
          </section>

          <section>
            <h2 id="consumer-protections" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              20. Consumer protections
            </h2>
            <p>
              If you use the services as a consumer, you may have mandatory rights under applicable
              consumer protection laws. Nothing in these Terms limits those rights.
            </p>
          </section>

          <section>
            <h2 id="validity-and-waiver" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              21. Validity and waiver
            </h2>
            <p>
              If any provision of these Terms is found unenforceable by a court of competent
              jurisdiction, the remaining provisions will continue to apply.
            </p>
            <p className="mt-4">
              The failure of the Hypercerts Foundation to enforce any provision of these Terms does
              not constitute a waiver of that provision or any other provision.
            </p>
          </section>

          <section>
            <h2 id="changes-to-these-terms" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              22. Changes to these Terms
            </h2>
            <p>
              The Hypercerts Foundation may update these Terms from time to time. We will notify
              users of material changes by posting a notice on certified.app and, where practicable,
              by email or other direct communication at least 30 days before the changes take
              effect.
            </p>
            <p className="mt-4">
              The updated Terms will indicate the date of the most recent revision. Your continued
              use of the services after the effective date of the updated Terms constitutes
              acceptance of the changes,{" "}
              <strong>to the extent permitted by applicable law</strong>.
            </p>
            <p className="mt-4">
              If you do not agree with the updated Terms, you may close your account in accordance
              with Section 15.
            </p>
          </section>

          <section>
            <h2 id="transfer-of-rights" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              23. Transfer of rights
            </h2>
            <p>
              Users may not transfer their rights or obligations under these Terms without the prior
              written consent of the Hypercerts Foundation.
            </p>
            <p className="mt-4">
              The Hypercerts Foundation may assign or transfer its rights or obligations as part of
              organizational restructuring or transfer of the services.
            </p>
          </section>

          <section>
            <h2 id="governing-law" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">24. Governing law</h2>
            <p>
              These Terms are governed by the laws of the State of California, regardless of
              conflict of laws rules.
            </p>
            <p className="mt-4">
              Any disputes arising out of or relating to these Terms will be resolved exclusively in
              the federal or state courts located in San Francisco County, California, and you
              consent to the personal jurisdiction of those courts.
            </p>
            <p className="mt-4">
              If you are a consumer in the European Union, this section does not affect any mandatory
              consumer protections or jurisdictional rights available to you under the laws of your
              country of residence.
            </p>
          </section>

          <section>
            <h2 id="entire-agreement" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">
              25. Entire agreement
            </h2>
            <p>
              These Terms of Service and the Certified Privacy Policy constitute the entire
              agreement between you and the Hypercerts Foundation regarding the services and
              supersede all prior understandings, communications, or agreements relating to the
              subject matter.
            </p>
          </section>

          <section>
            <h2 id="contact" className="font-headline text-h2 text-[var(--fg-primary)] mb-4 scroll-mt-24">26. Contact</h2>
            <p>
              For all inquiries — including support, legal notices, Digital Services Act
              communications, and privacy matters:
            </p>
            <p className="mt-4">
              <a
                href="mailto:legal@hypercerts.org"
                className="legal-link"
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
