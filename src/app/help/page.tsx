import type { Metadata } from "next";
import Link from "next/link";
import PageTitle from "@/components/layout/page-title";
import HelpFeedbackLink from "@/components/help/help-feedback-link";
import HelpTourButton from "@/components/help/help-tour-button";
import HelpFaq from "@/components/help/help-faq";

export const metadata: Metadata = {
  title: "Help",
  description:
    "How Certified works, answered: activities, projects, groups, endorsements, lists, your feed, Explore, followers, and your portable AT Protocol account. Start the walk-through or read the FAQ.",
  alternates: { canonical: "https://certified.app/help" },
  openGraph: {
    title: "Help — Certified",
    description:
      "How Certified works, answered: activities, projects, groups, endorsements, lists, your feed, Explore, and your portable AT Protocol account.",
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
              Certified is a place to record and recognize real work and impact. You publish{" "}
              <strong>activities</strong>, group them into <strong>projects</strong>, organize as{" "}
              <strong>groups</strong>, and back each other with <strong>endorsements</strong> —
              all on the open{" "}
              <a
                href="https://atproto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
              >
                AT Protocol
              </a>
              , so your account and everything you create stay portable across compatible apps
              instead of locked into one platform.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">
              What is certified.app?
            </h2>
            <p className="mb-4">
              certified.app is a view into the whole Certified network. It brings together every
              account on the network, the activities and impact data they publish, and the
              connections between them — who endorses whom, who follows whom, and who works
              together in which group. The data itself doesn&apos;t live in this app: each account
              keeps its own records on the AT Protocol, and certified.app reads across all of them
              to show the network in one place. Other compatible apps can present the same network
              in their own way.
            </p>
            <p>
              A good place to start browsing is{" "}
              <Link
                href="/explore"
                className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
              >
                Explore
              </Link>
              , and the{" "}
              <Link
                href="/endorsement-graph"
                className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
              >
                endorsement graph
              </Link>{" "}
              draws the network&apos;s connections as an interactive map.
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
            <h2 className="font-headline text-h2 text-[var(--fg-primary)] mb-4">
              Frequently asked questions
            </h2>
            <HelpFaq />
          </section>

          <section>
            <p>
              Still have a question, or spotted something that&apos;s off? Fill out the{" "}
              <HelpFeedbackLink />.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
