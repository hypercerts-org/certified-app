import FaqAccordion from "./faq-accordion";

// Also feeds the FAQPage JSON-LD in src/app/welcome/page.tsx — keep
// this export (and its path) stable.
export const FAQ_ITEMS = [
  {
    question: "Is this like 'Sign in with Google'?",
    answer:
      "The convenience is the same: one account that works across apps. The difference is who holds it. A Google account lives at Google; your Certified account belongs to you, with your record and supporters attached, and no company can lock you out of it.",
  },
  {
    question: "Do I need crypto or a wallet?",
    answer:
      "No. You sign in with your email and a one-time code. No crypto, no wallet, no passwords, no technical setup.",
  },
  {
    question: "What if I already have an account on a partner app?",
    answer:
      "On supported apps you can connect Certified to the account you already have. From then on, the work you do there is saved to your record.",
  },
  {
    question: "What does it cost?",
    answer:
      "Nothing, for people: creating an account and holding your record is free. For organizations connecting their systems to the network, get in touch.",
  },
  {
    question: "Is Certified only for environmental work?",
    answer:
      "No. Our founding community works in ecological regeneration — that's why many early profiles are land and climate projects — but accounts, records, and endorsements work the same way for any impact domain: open-source software, journalism, science, community events, and more.",
  },
  {
    question: "What apps support Certified?",
    answer:
      "Currently Ma Earth, GainForest, Silvi, Simocracy, and Hyperboards. More are joining over time.",
  },
  {
    question: "What happens if Certified disappears?",
    answer:
      "Your account lives on open standards and open-source software, operated by the Hypercerts Foundation. You can move it to another provider at any time, and everything you've published stays verifiable. The network doesn't depend on one company's survival.",
  },
];

export default function FaqSection() {
  return (
    <section id="faq" className="lp-section" aria-labelledby="lp-faq-title">
      <div className="lp-section__inner">
        <header className="lp-section__header">
          <span className="lp-eyebrow">Common questions</span>
          <h2 id="lp-faq-title" className="lp-h2">
            Frequently asked questions
          </h2>
        </header>
        <FaqAccordion items={FAQ_ITEMS} />
      </div>
    </section>
  );
}
