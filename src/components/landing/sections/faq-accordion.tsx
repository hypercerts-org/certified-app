"use client";

import { useState, type ReactNode } from "react";
import ContactCta from "@/components/landing/contact-cta";

interface FaqItem {
  question: string;
  answer: string;
  /** Optional element rendered at the end of the answer — e.g. a button that
   *  opens a live demo. */
  cta?: ReactNode;
}

/** Occurrences of "get in touch" in an answer become contact-modal
 *  triggers (the JSON-LD keeps the plain string). */
function withContactLinks(text: string) {
  const parts = text.split("get in touch");
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <ContactCta key={i} className="lp-faq__cta">
            get in touch
          </ContactCta>,
          part,
        ],
  );
}

/**
 * Hairline accordion. The open/close animation uses the
 * grid-template-rows 0fr→1fr technique (no max-height magic number);
 * the icon is a drawn plus whose vertical bar collapses to a minus.
 */
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="lp-faq">
      {items.map((item, index) => {
        const isOpen = openFaq === index;
        const answerId = `faq-answer-${index}`;
        const questionId = `faq-q-${index}`;
        return (
          <div key={index} className="lp-faq__item">
            <button
              id={questionId}
              className="lp-faq__btn"
              aria-expanded={isOpen}
              aria-controls={answerId}
              onClick={() => setOpenFaq(isOpen ? null : index)}
            >
              {item.question}
              <svg
                className={`lp-faq__icon${isOpen ? " lp-faq__icon--open" : ""}`}
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
              >
                <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" />
                <line className="lp-faq__icon-v" x1="9" y1="2" x2="9" y2="16" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <div
              id={answerId}
              role="region"
              aria-labelledby={questionId}
              className={`lp-faq__answer${isOpen ? " lp-faq__answer--open" : ""}`}
            >
              <div className="lp-faq__answer-inner">
                {/* Blank lines in an answer become paragraphs */}
                {item.answer.split("\n\n").map((paragraph, p) => (
                  <p key={p}>{withContactLinks(paragraph)}</p>
                ))}
                {item.cta ? (
                  <div className="lp-faq__answer-cta">{item.cta}</div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
