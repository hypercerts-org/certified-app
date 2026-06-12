"use client";

import { useFeedback } from "@/lib/feedback-context";

/**
 * Opens the shared feedback modal in its "contact" variant — same
 * form, same /api/feedback wiring, contact copy. Visual style comes
 * from the caller (lp-btn on the band, lp-link on the app wall); the
 * lp-contact-btn reset neutralizes the UA button chrome underneath.
 */
export default function ContactCta({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { openFeedback } = useFeedback();
  return (
    <button
      type="button"
      className={`lp-contact-btn ${className}`}
      onClick={() => openFeedback("contact")}
    >
      {children}
    </button>
  );
}
