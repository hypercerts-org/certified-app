import type { Metadata } from "next";
import PageTitle from "@/components/layout/page-title";
import PageContainer from "@/components/ui/page-container";
import PageHeader from "@/components/ui/page-header";
import SectionHeader from "@/components/ui/section-header";
import HelpFeedbackButton from "@/components/help/help-feedback-button";
import HelpTourButton from "@/components/help/help-tour-button";
import HelpFaq from "@/components/help/help-faq";
import { helpLinkCls } from "@/components/help/help-styles";

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

// A link to a section (#about, #walk-through, #questions, #feedback) lands
// it 24px below the fixed top chrome: the root's `scroll-padding-top:
// var(--chrome-top)` (layout.css) clears the top bar; this adds the
// breathing room.
const sectionCls = "flex scroll-mt-6 flex-col gap-3";
const proseCls = "m-0 text-body text-[var(--fg-secondary)] text-pretty";
const strongCls = "font-semibold text-[var(--fg-primary)]";

/**
 * /help: what Certified is, the walk-through, common questions, and a way
 * to send feedback, as one reading column: four short sections need no
 * contents list beside them (it read as a second menu next to the
 * sidebar). A server component (it exports `metadata`); the walk-through
 * and feedback buttons and the questions are client islands.
 */
export default function HelpPage() {
  return (
    <PageContainer>
      <PageTitle title="Help" />
      <PageHeader
        title="Help"
        description="How Certified works, and where to get help."
      />

      {/* The header's 16px plus 8px (phones) / 16px: the first section
          heading sits clearly apart from the page title, closer to its
          own text than to the header (proximity). Padding, not margin:
          a margin would collapse into the header's. */}
      <article className="flex min-w-0 max-w-measure flex-col gap-8 pt-2 md:gap-12 md:pt-4">
        <section id="about" aria-labelledby="help-about-title" className={sectionCls}>
          <SectionHeader id="help-about-title" title="About Certified" />
          <div className="flex flex-col gap-4">
            <p className={proseCls}>
              Certified is a place to record and recognize real work and impact. You
              publish <strong className={strongCls}>activities</strong>, group them
              into <strong className={strongCls}>projects</strong>, organize
              as <strong className={strongCls}>groups</strong>, and back each other
              with <strong className={strongCls}>endorsements</strong>, all on the
              open{" "}
              <a
                href="https://atproto.com"
                target="_blank"
                rel="noopener noreferrer"
                className={helpLinkCls}
              >
                AT Protocol
              </a>
              . Your account and everything you create stay portable across
              compatible apps instead of locked into one platform.
            </p>
            <p className={proseCls}>
              certified.app is a view into the whole Certified network. It brings
              together every account on the network, the activities and impact data
              they publish, and the connections between them: who endorses whom, who
              follows whom, and who works together in which group. The data
              doesn&apos;t live in this app. Each account keeps its own records on AT
              Protocol, and certified.app reads across all of them to show the network
              in one place. Other compatible apps can present the same network in
              their own way.
            </p>
          </div>
        </section>

        <section
          id="walk-through"
          aria-labelledby="help-walk-through-title"
          className={sectionCls}
        >
          <SectionHeader id="help-walk-through-title" title="Take the walk-through" />
          <p className={proseCls}>
            New here, or want a refresher? The walk-through shows you around:
            who you act as, your Workspace, the Network and its Feed, Apps,
            where you create something, and Settings. It takes a minute, and
            you can start it any time.
          </p>
          <div className="mt-1">
            <HelpTourButton />
          </div>
        </section>

        <section
          id="questions"
          aria-labelledby="help-questions-title"
          className={sectionCls}
        >
          <SectionHeader id="help-questions-title" title="Common questions" />
          <HelpFaq />
        </section>

        <section id="feedback" aria-labelledby="help-feedback-title" className={sectionCls}>
          <SectionHeader id="help-feedback-title" title="Still have a question?" />
          <p className={proseCls}>
            Ask us, or tell us about something that&apos;s off. Feedback goes
            straight to the team.
          </p>
          <div className="mt-1">
            <HelpFeedbackButton />
          </div>
        </section>
      </article>
    </PageContainer>
  );
}
