"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Network } from "lucide-react";
import Button from "@/components/ui/button";
import { helpLinkCls } from "./help-styles";

/**
 * The Help page's questions. Blank lines in an answer become separate
 * paragraphs. Answers stay self-contained; the page ends with a Send
 * feedback action for anything they don't cover.
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
      "An endorsement is a public vouch — a way of saying \"I stand behind this account.\" People and groups use them to back accounts they trust.\n\nTaken together, endorsements build a web of trust: instead of relying on a single authority to verify claims, credibility emerges from who is willing to publicly stake their reputation on whom. You can see how this connects up on the endorsement network.",
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
  <div className="flex flex-wrap gap-x-6 gap-y-2 text-body">
    <a
      href="https://docs.hypercerts.org/"
      target="_blank"
      rel="noopener noreferrer"
      className={helpLinkCls}
    >
      docs.hypercerts.org
    </a>
    <a
      href="https://t.me/+o4wPsJ7yEZYzNGFk"
      target="_blank"
      rel="noopener noreferrer"
      className={helpLinkCls}
    >
      Telegram group
    </a>
  </div>
);

interface FaqItem {
  question: string;
  answer: string;
  /** Rendered after the answer, e.g. a button that opens a live demo. */
  cta?: ReactNode;
}

/**
 * One question: a button (inside an h3, so questions show up in heading
 * navigation) that opens its answer. The answer collapses with the
 * grid-template-rows 0fr→1fr technique; `visibility` follows the collapse
 * so a closed answer leaves the accessibility tree and find-in-page.
 */
function FaqEntry({ item, index }: { item: FaqItem; index: number }) {
  const [open, setOpen] = useState(false);
  const questionId = `help-faq-q-${index}`;
  const answerId = `help-faq-a-${index}`;
  return (
    <li className="border-b border-[var(--border-subtle)] last:border-b-0">
      <h3 className="m-0">
        <button
          type="button"
          id={questionId}
          aria-expanded={open}
          aria-controls={answerId}
          onClick={() => setOpen((v) => !v)}
          className="group flex w-full cursor-pointer items-center justify-between gap-4 rounded py-4 text-left text-body font-medium text-[var(--fg-primary)] select-none [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <span className="text-pretty">{item.question}</span>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            aria-hidden
            className={`shrink-0 text-[var(--fg-muted)] transition-[transform,color] duration-fast ease-out motion-reduce:transition-none group-hover:text-[var(--fg-primary)] ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </h3>
      <div
        id={answerId}
        role="region"
        aria-labelledby={questionId}
        className={`grid motion-reduce:transition-none ${
          open
            ? "visible grid-rows-[1fr] [transition:grid-template-rows_var(--duration-base)_var(--ease-out),visibility_0s]"
            : "invisible grid-rows-[0fr] [transition:grid-template-rows_var(--duration-base)_var(--ease-out),visibility_0s_var(--duration-base)]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-4 pb-5">
            {/* Blank lines in an answer become paragraphs. */}
            {item.answer.split("\n\n").map((paragraph, p) => (
              <p
                key={p}
                className="m-0 max-w-measure text-body text-[var(--fg-secondary)] text-pretty"
              >
                {paragraph}
              </p>
            ))}
            {item.cta ? <div>{item.cta}</div> : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * The Help page's questions and answers: hairline rows that open in place.
 * Kept in its own client file so the Help page can stay a server component
 * and keep exporting `metadata`. One answer carries a button that opens the
 * live endorsement network in a large dialog.
 */
export default function HelpFaq() {

  const items: FaqItem[] = HELP_FAQ_ITEMS.map((item) => {
    if (item.question === "What does it mean to endorse someone?") {
      return {
        ...item,
        cta: (
          <Button variant="secondary" size="sm" href="/graph">
            <Network size={14} strokeWidth={1.75} aria-hidden />
            Open the endorsement network
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
    <ul className="m-0 list-none border-y border-[var(--border-subtle)] p-0">
      {items.map((item, index) => (
        <FaqEntry key={item.question} item={item} index={index} />
      ))}
    </ul>
  );
}
