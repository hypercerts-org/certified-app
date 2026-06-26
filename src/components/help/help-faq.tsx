"use client";

import FaqAccordion from "@/components/landing/sections/faq-accordion";

/**
 * The Help-page FAQ. Reuses the landing `FaqAccordion` (the hairline,
 * 0fr→1fr accordion) so the question/answer pattern stays consistent
 * across the site. Kept in its own client file so the Help page can
 * remain a server component and keep exporting `metadata`.
 *
 * Questions are grouped into themed sections (basics → recognition &
 * groups → your network → your account) so the list is easier to scan;
 * each group is its own accordion under a small heading.
 *
 * Blank lines in an answer become separate paragraphs (see FaqAccordion).
 */
const FAQ_GROUPS = [
  {
    title: "The basics",
    items: [
      {
        question: "What is an activity?",
        answer:
          "An activity is the basic unit of impact on Certified: a structured, shareable record of work that was done or is planned. Each one captures the essentials of a verifiable claim — what the work is, who contributes to it, the time period it covers, its scope, and where it happens.\n\nContributors can be recognized for their part, so an activity reads as \"this work is being carried out, by these people, over this period.\"",
      },
      {
        question: "How are projects different from activities?",
        answer:
          "An activity is a single claim; a project is the larger effort those claims belong to — a campaign, a program, or an ongoing body of work. Projects group related activities under one umbrella so you can tell the story of sustained work over time and navigate from the high-level effort down to the individual activities that make it up.",
      },
      {
        question: "What are lists for?",
        answer:
          "Lists are collections you curate yourself — of activities, of projects, or of accounts. They're a lightweight way to bring structure to what matters to you: a reading list of impactful work, a roster of accounts to watch, or a themed grouping you want to point people to and share.",
      },
    ],
  },
  {
    title: "Recognition & groups",
    items: [
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
    ],
  },
  {
    title: "Your network & feed",
    items: [
      {
        question: "What's the difference between my feed and Explore?",
        answer:
          "Your feed is the home stream of recent activity from the accounts and groups you follow — the place to keep up with people you already care about. Explore is the discovery surface: it helps you find activities, projects, and accounts you don't yet follow, so you can broaden your view across the whole network.",
      },
      {
        question: "Do my Bluesky followers carry over?",
        answer:
          "Following on Certified runs on its own follow graph, kept separately from your Bluesky follows, so the two sets may not match exactly. Because both apps share the same AT Protocol identities, they aren't locked apart: you can sync your Bluesky follows into Certified so you don't have to rebuild your network from scratch.",
      },
    ],
  },
  {
    title: "Your account & AT Protocol",
    items: [
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
    ],
  },
];

export default function HelpFaq() {
  return (
    <div className="help-faq">
      {FAQ_GROUPS.map((group) => (
        <div key={group.title} className="help-faq__group">
          <h3 className="help-faq__group-title">{group.title}</h3>
          <FaqAccordion items={group.items} />
        </div>
      ))}
    </div>
  );
}
