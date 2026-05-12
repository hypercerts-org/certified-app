import type { Metadata } from "next";
import Link from "next/link";
import PageTitle from "@/components/layout/page-title";

export const metadata: Metadata = {
  title: "About",
  description:
    "Certified is a platform for recognizing contributors who do meaningful work across impact domains — from land regeneration to open source to scientific research.",
  alternates: { canonical: "https://certified.app/about" },
  openGraph: {
    title: "About — Certified",
    description:
      "A platform for recognizing impact contributors and connecting them with the resources they need to keep going.",
    url: "https://certified.app/about",
    type: "website",
    images: [{ url: "/assets/certs-hero-1200x630.png", width: 1200, height: 630, alt: "Certified" }],
  },
};

export default function AboutPage() {
  return (
    <div className="app-page">
      <PageTitle title="About" />
      <div className="app-page__inner max-w-3xl">
        <div className="prose prose-navy max-w-none space-y-8">
          <section>
            <h2 className="font-headline text-xl text-[var(--fg-primary)] mb-4">What is Certified?</h2>
            <p>
              Certified is a platform for recognizing the people doing meaningful work
              across impact domains. Whether it&apos;s land regeneration, open source software
              development, investigative journalism, scientific research, community organizing,
              or any other field where people contribute to the common good — Certified
              makes that work visible.
            </p>
            <p className="mt-4">
              Contributors publish activity claims that document what they&apos;ve done, who was
              involved, and the scope of their work. These claims are public, verifiable, and
              portable — they belong to the contributor, not the platform.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl text-[var(--fg-primary)] mb-4">Why does this matter?</h2>
            <p>
              People working on some of the hardest problems — restoring degraded ecosystems,
              maintaining critical open source infrastructure, advancing scientific frontiers,
              building community resilience — often struggle to get recognized for their
              contributions. Without recognition, it&apos;s difficult to attract the resources
              needed to continue.
            </p>
            <p className="mt-4">
              Certified creates a shared, open record of this work. The goal is not just
              visibility, but to build the foundation for contributors to access funding,
              collaboration, and support. Features for connecting contributors with resources
              are coming soon.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl text-[var(--fg-primary)] mb-4">How does it work?</h2>
            <p>
              Certified is built on{" "}
              <a
                href="https://atproto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                AT Protocol
              </a>
              , the open standard behind Bluesky and a growing ecosystem of decentralized
              applications. When you sign up, you get an AT Protocol identity and a Personal
              Data Server (PDS) hosted at <strong>certified.one</strong>. Your profile, activity
              claims, and data are yours — portable across any app that speaks AT Protocol.
            </p>
            <p className="mt-4">
              Sign-in is passwordless: enter your email, receive a one-time code, and you&apos;re
              in. No passwords to remember, no accounts to manage across different services.
              Your identity is cryptographically verifiable and works the same whether you&apos;re
              on certified.app or any partner application.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl text-[var(--fg-primary)] mb-4">
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
              , a Delaware nonstock corporation founded in February 2023. The Foundation builds
              open infrastructure for tracking, funding, and rewarding positive impact — and
              Certified is the social layer of that ecosystem.
            </p>
            <p className="mt-4">
              The Foundation chose AT Protocol as the foundation for Certified because impact
              work shouldn&apos;t be locked into a single platform. Contributors need to move freely
              between applications while keeping their profile, claims, and reputation intact.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl text-[var(--fg-primary)] mb-4">Open source</h2>
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
          </section>

          <section>
            <h2 className="font-headline text-xl text-[var(--fg-primary)] mb-4">Infrastructure</h2>
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
            <h2 className="font-headline text-xl text-[var(--fg-primary)] mb-4">Contact</h2>
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
                href="https://bsky.app/profile/hypercerts.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                Bluesky
              </a>
              {" · "}
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
