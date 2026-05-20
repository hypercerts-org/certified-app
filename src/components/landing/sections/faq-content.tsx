import FaqAccordion from "./faq-accordion";

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
      "Currently Ma Earth, GainForest, Simocracy, and Hyperboards. More apps are joining over time.",
  },
];

export default function FaqSection() {
  return (
    <section id="faq" className="landing-section landing-section--subtle">
      <div className="landing-section__inner">
        <div className="landing-section__header landing-section__header--center">
          <span className="landing-label">Common Questions</span>
          <h2>Frequently asked questions</h2>
        </div>
        <FaqAccordion items={FAQ_ITEMS} />
      </div>
    </section>
  );
}
