import { Fragment } from "react";
import ContactCta from "@/components/landing/contact-cta";

type FaqItem = { question: string; answer: string };

/** "get in touch" in an answer becomes the contact link. */
function withContactLinks(text: string) {
  const parts = text.split("get in touch");
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <ContactCta className="lp-faq__cta">get in touch</ContactCta>}
      {part}
    </Fragment>
  ));
}

/**
 * The questions as native disclosures (<details>): they open and close
 * without JavaScript and are found by the browser's find-in-page.
 */
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <div className="lp-faq">
      {items.map((item) => (
        <details key={item.question} className="lp-faq__item">
          <summary className="lp-faq__btn">
            <h3 className="lp-faq__q">{item.question}</h3>
            <svg
              className="lp-faq__icon"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
            >
              <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" />
              <line
                className="lp-faq__icon-v"
                x1="9"
                y1="2"
                x2="9"
                y2="16"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </summary>
          <div className="lp-faq__answer-inner">
            {item.answer.split("\n\n").map((paragraph) => (
              <p key={paragraph}>{withContactLinks(paragraph)}</p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
