import type { ReactNode } from "react";

/** Where organizations get in touch: the Hypercerts Foundation's contact form. */
export const CONTACT_URL = "https://hypercerts.org/contact";

/**
 * "Get in touch": opens the Hypercerts Foundation's contact form in a new
 * tab (staging opens its own feedback form; v2 has none). The look comes
 * from the caller (lp-btn on the band, lp-link elsewhere).
 */
export default function ContactCta({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={CONTACT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`lp-contact-btn ${className}`}
    >
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
