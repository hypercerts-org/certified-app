"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

const FAQ_ITEMS = [
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
    question: "Is my data safe?",
    answer:
      "We use encrypted connections and one-time email codes. You control where you use Certified.",
  },
  {
    question: "What apps support Certified?",
    answer:
      "Currently Ma Earth, GainForest, Hyperboards, and Silvi. More apps are joining over time.",
  },
];

export default function Faq() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section id="faq" className="landing-section landing-section--light">
      <div className="landing-section__inner">
        <h2>Frequently asked questions</h2>
        <div className="landing-faq">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openFaq === index;
            const answerId = `faq-answer-${index}`;
            const questionId = `faq-q-${index}`;
            return (
              <div key={index} className="landing-faq-item">
                <button
                  id={questionId}
                  className="landing-faq-btn"
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                >
                  {item.question}
                  <Plus className={`landing-faq-icon${isOpen ? " landing-faq-icon--open" : ""}`} />
                </button>
                <div
                  id={answerId}
                  role="region"
                  aria-labelledby={questionId}
                  className={`landing-faq-answer${isOpen ? " landing-faq-answer--open" : ""}`}
                >
                  <p>{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
