import type { Metadata } from "next";
import Link from "next/link";
import PageTitle from "@/components/layout/page-title";
import HelpFeedbackLink from "@/components/help/help-feedback-link";
import HelpTourButton from "@/components/help/help-tour-button";

export const metadata: Metadata = {
  title: "Help",
  description:
    "Learn how Certified works: activities, projects, groups, endorsements, lists, your feed, the Explore page, followers, and how your portable AT Protocol account interoperates with apps like Ma Earth.",
  alternates: { canonical: "https://certified.app/help" },
  openGraph: {
    title: "Help — Certified",
    description:
      "Learn how Certified works: activities, projects, groups, endorsements, lists, your feed, the Explore page, and your portable AT Protocol account.",
    url: "https://certified.app/help",
    type: "website",
    images: [{ url: "/assets/certs-hero-1200x630.png", width: 1200, height: 630, alt: "Certified — One account. Your work. Recognized everywhere." }],
  },
};

export default function HelpPage() {
  return (
    <div className="app-page legal-page">
      <PageTitle title="Help" />
      <div className="app-page__inner">
        <div className="prose max-w-none space-y-8">
          <section>
            <h1 className="font-headline text-h1 text-[var(--fg-primary)] tracking-tight mb-4">
              Help &amp; getting started
            </h1>
            <p>
              Certified is a place to record and recognize real work and impact. You publish
              <strong> activities</strong> — verifiable claims about work and impact — group them into
              <strong> projects</strong>, organize as <strong>groups</strong>, and back each
              other with <strong>endorsements</strong>. Because Certified is built on the
              open{" "}
              <a
                href="https://atproto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
              >
                AT Protocol
              </a>{" "}
              — the same network that powers Bluesky — your account and everything you create is
              portable across compatible apps rather than locked into one platform.
            </p>
            <p className="mt-4">
              Certified is the place to explore the <strong>whole network</strong> — the accounts,
              activities, projects, and endorsements across it, no matter which app they were
              created in. Other apps on the same protocol focus on more specific use cases:{" "}
              <strong>Ma Earth</strong>, for example, is built around funding regenerative land
              projects. We&apos;d love to see many more of these focused apps — for funding and for
              recognizing impactful work — each serving its own community while building on the same
              shared, open data.
            </p>
            <p className="mt-4">
              This page walks through the core concepts and the main surfaces of the app. If you
              still have questions or spot something that&apos;s off, fill out the{" "}
              <HelpFeedbackLink />.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">
              Take the walk-through
            </h2>
            <p className="mb-4">
              New here, or want a refresher? The walk-through highlights the main parts of the app —
              your feed, Explore, Create, and your profile — in a few quick steps. You can start it
              any time.
            </p>
            <HelpTourButton />
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">Activities</h2>
            <p>
              An <strong>activity</strong> is the basic unit of impact on Certified: a record of
              something that was done — or something that is planned. Each activity captures the
              essentials of a verifiable claim — what the work is, who contributes to it, the time
              period it covers, its scope, and where it happens.
            </p>
            <p className="mt-4">
              Think of an activity as a structured, shareable statement: &quot;this work is being
              carried out, by these people, over this period.&quot; Contributors can be recognized
              for their part in the work.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">Projects</h2>
            <p>
              A <strong>project</strong> groups related activities together under one umbrella. Where
              an activity is a single claim, a project is the bigger effort those claims belong to —
              a campaign, a program, or an ongoing body of work.
            </p>
            <p className="mt-4">
              Projects make it easier to tell the story of sustained work over time and to navigate
              from the high-level effort down to the individual activities that make it up.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">Groups</h2>
            <p>
              A <strong>group</strong> represents an organization or team. Any account can act as a
              group, and a group has its own profile, activities, and endorsements — just like an
              individual account.
            </p>
            <p className="mt-4">
              Groups have an <strong>owner</strong>, <strong>admins</strong>, and{" "}
              <strong>members</strong>. The owner and admins manage the group and who belongs to it,
              while members contribute under the group&apos;s identity. When you switch to acting as
              a group, the activities you create and the endorsements you give are attributed to
              that group rather than to you personally.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">Endorsements</h2>
            <p>
              An <strong>endorsement</strong>{" "}is a public vouch or attestation. People and
              groups use endorsements to back an <strong>account</strong>, signalling &quot;I stand
              behind this account.&quot;
            </p>
            <p className="mt-4">
              Taken together, endorsements build a <strong>web of trust</strong>: rather than relying
              on a single authority to verify claims, credibility emerges from who is willing to
              publicly stake their reputation on whom. The more an account is endorsed by others you
              trust, the more confidence you can place in it.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">Lists</h2>
            <p>
              <strong>Lists</strong> are collections you curate yourself. You can build a list of
              activities, of projects, or of accounts to organize what matters to you and to share
              curated sets with others.
            </p>
            <p className="mt-4">
              Lists are a lightweight way to bring structure to the things you care about — a
              reading list of impactful work, a roster of accounts to watch, or a themed grouping you
              want to point people to.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">Your feed</h2>
            <p>
              Your <strong>feed</strong>{" "}is the home stream of recent activity from the accounts
              and groups you follow. It&apos;s the place to keep up with new activities, projects, and
              endorsements from the people and organizations you care about.
            </p>
            <p className="mt-4">
              The more accounts and groups you follow, the richer your feed becomes — so it&apos;s
              worth using Explore to find more of the work you want to keep track of.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">The Explore page</h2>
            <p>
              <strong>Explore</strong>{" "}is the discovery surface. While your feed shows the accounts
              you already follow, Explore helps you find activities, projects, and accounts you
              don&apos;t yet — a way to broaden your view and discover new work and people across
              Certified.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">
              Your handle and your DID
            </h2>
            <p>
              Every account has two names that work together. Your{" "}
              <strong>handle</strong> (your username) is the human-readable one
              — something like <code>@you.certified.one</code>. It&apos;s how
              people find, mention, and recognize you, and it can be changed
              later; you can even bring your own domain to use as your handle.
            </p>
            <p className="mt-4">
              Your <strong>DID</strong> (a Decentralized Identifier, e.g.{" "}
              <code>did:plc:abc123…</code>) is the permanent one. It never
              changes and it&apos;s what actually owns your data, so your
              activities, endorsements, and follows stay attached to you even if
              you rename your handle or move to a different server.
            </p>
            <p className="mt-4">
              Think of the handle as a friendly label pointing at the DID
              underneath: the handle is what you read and share, while the DID
              is the durable identity it resolves to. If a handle ever stops
              resolving, the DID remains the source of truth for who an account
              is.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">Followers</h2>
            <p>
              Following on Certified runs on its own <strong>Certified follow graph</strong> — a
              record of who follows whom that is kept separately from your Bluesky follows. So the
              people who follow you here, and the accounts you follow, may not be exactly the same
              set as on Bluesky.
            </p>
            <p className="mt-4">
              Because both apps are built on the same AT Protocol identities, the two graphs
              aren&apos;t locked apart: you can easily sync your Bluesky follows into Certified, so
              you don&apos;t have to rebuild your network from scratch. Either way, your follows stay
              tied to your portable identity.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">
              Your Certified account
            </h2>
            <p>
              Your <strong>Certified account</strong>{" "}is a portable AT Protocol identity: a
              handle plus a DID, with your data stored on a Personal Data Server you control. Unlike
              a traditional login, it isn&apos;t locked inside one platform.
            </p>
            <p className="mt-4">
              That portability is the point. You can use the same account across compatible apps, and
              if you ever want to move, you can take your identity and data with you. Your account is
              yours — verifiable, portable, and independent of any single service.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">
              How Certified works with other apps
            </h2>
            <p>
              Because your data lives on the open AT Protocol in shared, open record types (called{" "}
              <strong>lexicons</strong>), different apps are essentially different front-ends over the
              same underlying data. Certified is one such app; others — for example{" "}
              <strong>Ma Earth</strong> — are others on the same network.
            </p>
            <p className="mt-4">
              In practice that means an activity or endorsement you create in one app is visible in
              the others, you sign in with the same account everywhere, and the apps interoperate
              instead of siloing your data. Rather than re-entering your work in each tool, you
              maintain one portable record that every compatible app can read and build on.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
