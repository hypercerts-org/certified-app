import ReadyCtaButton from "./ready-cta-button";

export default function ReadyCtaSection() {
  return (
    <section id="ready-cta" className="landing-section landing-section--light landing-section--pattern">
      <div className="landing-section__pattern landing-section__pattern--dark" aria-hidden="true">
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
        <span className="landing-label">Get Started</span>
        <h2>Ready to get started?</h2>
        <p>Create your account in under a minute.</p>
        <ReadyCtaButton />
      </div>
    </section>
  );
}
