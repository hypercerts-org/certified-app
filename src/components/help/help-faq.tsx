"use client";

import { useState } from "react";
import { Network } from "lucide-react";
import FaqAccordion from "@/components/landing/sections/faq-accordion";
import Button from "@/components/ui/button";
import EndorsementGraphModal from "./endorsement-graph-modal";

/**
 * The Help-page FAQ. Reuses the landing `FaqAccordion` (the hairline,
 * 0fr→1fr accordion) so the question/answer pattern stays consistent
 * across the site. Kept in its own client file so the Help page can
 * remain a server component and keep exporting `metadata`.
 *
 * Blank lines in an answer become separate paragraphs (see FaqAccordion).
 * The literal phrase "get in touch" in an answer becomes a contact-modal
 * trigger, so we use the feedback form link in the page intro instead and
 * keep these answers self-contained.
 */
const HELP_FAQ_ITEMS = [
  {
    question: "What is an activity?",
    answer:
      "An activity is the basic unit on Certified: a structured, shareable record of work that was done or is planned. Each one captures the essentials of a verifiable claim — what the work is, who contributes to it, the time period it covers, its scope, and where it happens.\n\nContributors can be recognized for their part, so an activity reads as \"this work is being carried out, by these people, over this period.\"",
  },
  {
    question: "How are projects different from activities?",
    answer:
      "An activity is a single claim; a project is the larger effort those claims belong to — a campaign, a program, or an ongoing body of work. Projects group related activities under one umbrella so you can tell the story of sustained work over time and navigate from the high-level effort down to the individual activities that make it up.",
  },
  {
    question: "What does it mean to endorse someone?",
    answer:
      "An endorsement is a public vouch — a way of saying \"I stand behind this account.\" People and groups use them to back accounts they trust.\n\nTaken together, endorsements build a web of trust: instead of relying on a single authority to verify claims, credibility emerges from who is willing to publicly stake their reputation on whom. You can see how this connects up on the endorsement graph.",
  },
  {
    question: "What are groups, and how do roles work?",
    answer:
      "A group represents an organization or team. It has its own profile, activities, and endorsements, just like an individual account. Groups have an owner, admins, and members: owners and admins manage the group and its membership, while members contribute under the group's identity.\n\nWhen you switch to acting as a group, the activities you create and the endorsements you give are attributed to that group rather than to you personally. You can also import an existing organization account into a group.",
  },
  {
    question: "Do my Bluesky followers carry over?",
    answer:
      "Following on Certified runs on its own follow graph, kept separately from your Bluesky follows, so the two sets may not match exactly. Because both apps share the same AT Protocol identities, they aren't locked apart: you can sync your Bluesky follows into Certified so you don't have to rebuild your network from scratch.",
  },
  {
    question: "What are my handle and my DID?",
    answer:
      "Your handle (your username, like @you.certified.one) is the human-readable name people use to find and mention you. It can change, and you can even bring your own domain.\n\nYour DID is the permanent identifier underneath. It never changes and it's what actually owns your data, so your activities, endorsements, and follows stay attached to you even if you rename your handle or move servers. The handle is a friendly label pointing at the DID.",
  },
  {
    question: "Why is Certified built on AT Protocol?",
    answer:
      "AT Protocol is the open, decentralized network that also powers Bluesky. Building on it means your account and everything you create are portable: your data lives on a Personal Data Server you control, in shared open record types (lexicons) that any compatible app can read.\n\nIn practice an activity or endorsement you create in one app shows up in the others, you sign in with the same account everywhere, and your work isn't siloed inside a single platform.",
  },
  {
    question: "How does Certified work with apps like Ma Earth?",
    answer:
      "Different apps on AT Protocol are essentially different front-ends over the same underlying data. Certified is the place to explore the whole network — accounts, activities, projects, and endorsements — no matter which app created them. Other apps focus on specific use cases: Ma Earth, for example, is built around funding regenerative land projects.\n\nBecause they share open lexicons, these apps interoperate instead of competing for your data: you maintain one portable record that every compatible app can build on.",
  },
  {
    question: "How can we build with Certified?",
    answer:
      "Check out the docs, where you'll also find AI skills, and get in contact with us — best in our Telegram group.",
  },
];

const BUILD_LINKS = (
  <div className="flex flex-wrap gap-4">
    <a
      href="https://docs.hypercerts.org/"
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
    >
      docs.hypercerts.org
    </a>
    <a
      href="https://t.me/+o4wPsJ7yEZYzNGFk"
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
    >
      Telegram group
    </a>
  </div>
);

export default function HelpFaq() {
  const [graphOpen, setGraphOpen] = useState(false);

  // Inject a "see it live" button into the endorsement answer that opens the
  // graph in a large modal (the cta lives here so it can drive modal state).
  const items = HELP_FAQ_ITEMS.map((item) => {
    if (item.question === "What does it mean to endorse someone?") {
      return {
        ...item,
        cta: (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setGraphOpen(true)}
          >
            <Network size={14} strokeWidth={1.75} aria-hidden />
            Open the endorsement graph
          </Button>
        ),
      };
    }
    if (item.question === "How can we build with Certified?") {
      return { ...item, cta: BUILD_LINKS };
    }
    return item;
  });

  return (
    <>
      <FaqAccordion items={items} />
      {graphOpen && (
        <EndorsementGraphModal onClose={() => setGraphOpen(false)} />
      )}
    </>
  );
}
