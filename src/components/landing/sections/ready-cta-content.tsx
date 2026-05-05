import ReadyCtaButton from "./ready-cta-button";

export default function ReadyCtaSection() {
  return (
    <section id="ready-cta" className="landing-section landing-section--cream">
      <div className="landing-section__inner landing-cta">
        <span className="landing-label landing-cta__eyebrow">One last thing</span>
        <h2 className="landing-cta__headline">
          Ready when <span className="landing-cta__headline-italic">you</span> are.
        </h2>
        <p className="landing-cta__lede">
          One identity — every app you sign in to. Takes a minute.
        </p>
        <ReadyCtaButton />
        <p className="landing-cta__micro">
          Free forever &nbsp;·&nbsp; No passwords &nbsp;·&nbsp; Walk away anytime
        </p>
      </div>
    </section>
  );
}
