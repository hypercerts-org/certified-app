"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="landing-faq">
      {items.map((item, index) => {
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
  );
}
