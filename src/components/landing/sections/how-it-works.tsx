export default function HowItWorks() {
  return (
    <section id="how-it-works" className="landing-section landing-section--subtle">
      <div className="landing-section__inner">
        <div className="landing-section__header landing-section__header--center">
          <span className="landing-label">Simple Process</span>
          <h2>How it works</h2>
          <p className="landing-protocol__intro">
            Three steps to a portable identity.
          </p>
        </div>
        <div className="landing-protocol__steps">
          <div className="landing-protocol__step">
            <span className="landing-protocol__num">01</span>
            <div>
              <h4>Create your Certified ID</h4>
              <p>Enter your email. We send a one-time code.</p>
            </div>
          </div>
          <div className="landing-protocol__step">
            <span className="landing-protocol__num">02</span>
            <div>
              <h4>Sign in to partner apps</h4>
              <p>Use it anywhere you see &apos;Sign in with Certified&apos;.</p>
            </div>
          </div>
          <div className="landing-protocol__step">
            <span className="landing-protocol__num">03</span>
            <div>
              <h4>Your profile is already there</h4>
              <p>Your profile and records follow you automatically.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
