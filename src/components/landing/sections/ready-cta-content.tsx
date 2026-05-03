import ReadyCtaButton from "./ready-cta-button";

export default function ReadyCtaSection() {
  return (
    <section id="ready-cta" className="landing-section landing-section--brand landing-section--pattern">
      <div className="landing-section__pattern landing-section__pattern--light" aria-hidden="true">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid-cta" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-cta)" />
        </svg>
      </div>
      <div className="landing-section__inner landing-cta">
        <span className="landing-label landing-label--light">Get Started</span>
        <h2>Ready when you are.</h2>
        <p>
          Create your Certified account in under a minute. One identity — every
          app you sign in to.
        </p>
        <ReadyCtaButton />
        <p className="landing-cta__micro">
          <span aria-hidden="true">✓</span> Free forever &nbsp;·&nbsp;
          <span aria-hidden="true">✓</span> No passwords &nbsp;·&nbsp;
          <span aria-hidden="true">✓</span> Walk away anytime
        </p>
      </div>
    </section>
  );
}
