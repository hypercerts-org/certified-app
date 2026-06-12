import FaqAccordion from "./faq-accordion";

// Also feeds the FAQPage JSON-LD in src/app/welcome/page.tsx — keep
// this export (and its path) stable.
export const FAQ_ITEMS = [
  {
    question: "Is this like 'Sign in with Google'?",
    answer:
      "Similar idea: one account across apps. The difference is that Certified is designed so you're not locked into one company or one app.",
  },
  {
    question: "Do I need crypto or a wallet?",
    answer:
      "No. Certified works with just your email. No crypto, no wallet, no technical setup required.",
  },
  {
    question: "What if I already have an account on a partner app?",
    answer:
      "On supported platforms, you can connect Certified to an existing account.",
  },
  {
    question: "Can I stop using Certified later?",
    answer:
      "Yes. Your data is portable — you can export it or simply stop using the service at any time.",
  },
  {
    question: "What apps support Certified?",
    answer:
      "Currently Ma Earth, GainForest, Silvi, Simocracy, and Hyperboards. More apps are joining over time.",
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
