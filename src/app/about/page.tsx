import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "Certified is a passwordless identity platform built on AT Protocol, operated by the Hypercerts Foundation. Learn how Certified works, who builds it, and why portable identity matters.",
  alternates: { canonical: "https://certified.app/about" },
  openGraph: {
    title: "About — Certified",
    description:
      "Certified is a passwordless identity platform built on AT Protocol, operated by the Hypercerts Foundation.",
    url: "https://certified.app/about",
  },
};

export default function AboutPage() {
  return (
    <div className="app-page">
      <div className="app-page__inner max-w-3xl">
        <h1 className="font-mono text-h1 text-navy tracking-tight mb-8">
          About Certified
        </h1>

        <div className="prose prose-navy max-w-none space-y-8">
          <section>
            <h2 className="font-mono text-xl text-navy mb-4">What is Certified?</h2>
            <p>
              Certified is a passwordless identity platform built on{" "}
              <a
                href="https://atproto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                AT Protocol
              </a>
              , the open standard behind Bluesky and a growing ecosystem of decentralized
              applications. It lets you create a single account that works across every partner
              app — no passwords, no vendor lock-in, and full control over your data.
            </p>
            <p className="mt-4">
              When you sign up for Certified, you get an AT Protocol identity and a Personal Data
              Server (PDS) hosted at <strong>certified.one</strong>. Your profile, preferences,
              and activity travel with you to every app that supports Certified — currently
              including Ma Earth, GainForest, Simocracy, and Hyperboards.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">How does it work?</h2>
            <p>
              Sign-in is passwordless: you enter your email, receive a one-time code, and
              you&apos;re in. Behind the scenes, Certified issues an AT Protocol identity tied to
              your account. That identity is cryptographically verifiable and portable — it works
              the same whether you&apos;re on certified.app, a partner application, or any future
              service that speaks AT Protocol.
            </p>
            <p className="mt-4">
              Your data lives on your Personal Data Server. Applications read from it with your
              permission. If you ever want to leave, you can export everything or migrate your
              identity to a different PDS provider — no data is locked inside Certified.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">What is AT Protocol?</h2>
            <p>
              AT Protocol (Authenticated Transfer Protocol) is an open, federated protocol for
              building social and identity applications. Unlike centralized platforms where one
              company controls your account, AT Protocol separates identity from the application
              layer. Your identity is yours — verifiable, portable, and independent of any single
              service.
            </p>
            <p className="mt-4">
              Certified builds on AT Protocol to provide a managed, user-friendly entry point: you
              get the benefits of decentralized identity without needing to understand the
              underlying protocol or run your own infrastructure.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              Who operates Certified?
            </h2>
            <p>
              Certified is operated by the{" "}
              <a
                href="https://hypercerts.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                Hypercerts Foundation
              </a>
              , a Delaware nonstock corporation founded in February 2023. The Foundation develops
              open infrastructure for the hypercerts ecosystem — tools and protocols that help
              track, fund, and reward positive impact.
            </p>
            <p className="mt-4">
              Certified was created because the hypercerts ecosystem needed a portable identity
              layer: a way for users to move between applications while keeping their profile,
              contributions, and reputation intact. Rather than build a proprietary login system,
              the Foundation chose AT Protocol as the foundation — making Certified interoperable
              with a growing network of decentralized applications.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">
              How is Certified different from &quot;Sign in with Google&quot;?
            </h2>
            <p>
              Both Certified and &quot;Sign in with Google&quot; let you use one account across
              multiple apps. The key difference is ownership and portability:
            </p>
            <ul className="list-disc pl-6 mt-4 space-y-2">
              <li>
                <strong>With Google:</strong> Google controls your identity. If Google suspends
                your account or changes their terms, you lose access to every app you signed into.
                Your data stays with each individual app.
              </li>
              <li>
                <strong>With Certified:</strong> Your identity is an AT Protocol identity — it&apos;s
                cryptographically yours. You can export your data, migrate to another provider, or
                even self-host. No single company can revoke your identity.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">Open source</h2>
            <p>
              Every component of Certified is open source. The application code, the PDS
              infrastructure, and the protocol it builds on are all publicly auditable. You can
              review the source on{" "}
              <a
                href="https://github.com/hypercerts-org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                GitHub
              </a>
              .
            </p>
            <p className="mt-4">
              Security through transparency, not obscurity. If you find an issue, you can report
              it directly or submit a fix.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">Infrastructure</h2>
            <p>
              The Personal Data Servers operated by Certified are hosted on cloud infrastructure
              located within the European Union. The service is designed to comply with GDPR and
              the Digital Services Act.
            </p>
            <p className="mt-4">
              For more details, see our{" "}
              <Link href="/privacy" className="text-blue-600 underline hover:text-blue-800">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/dsa" className="text-blue-600 underline hover:text-blue-800">
                DSA Compliance
              </Link>{" "}
              page.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xl text-navy mb-4">Contact</h2>
            <p>
              <strong>Hypercerts Foundation</strong>
              <br />
              1209 Orange St.
              <br />
              Wilmington, DE 19801
              <br />
              United States
            </p>
            <p className="mt-4">
              Email:{" "}
              <a
                href="mailto:support@hypercerts.org"
                className="text-blue-600 underline hover:text-blue-800"
              >
                support@hypercerts.org
              </a>
            </p>
            <p className="mt-4">
              <a
                href="https://x.com/hypercerts"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                Twitter/X
              </a>
              {" · "}
              <a
                href="https://www.linkedin.com/company/hypercerts"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                LinkedIn
              </a>
              {" · "}
              <a
                href="https://bsky.app/profile/hypercerts.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                Bluesky
              </a>
              {" · "}
              <a
                href="https://github.com/hypercerts-org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                GitHub
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
