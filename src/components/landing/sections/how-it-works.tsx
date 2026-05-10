export default function HowItWorks() {
  return (
    <section id="how-it-works" className="landing-section landing-section--subtle">
      <div className="landing-section__inner">
        <div className="landing-section__header landing-section__header--center">
          <h2>How it works</h2>
          <p className="landing-protocol__intro">
            Three steps to a portable identity.
          </p>
        </div>
        <div className="landing-protocol__steps">
          <div className="landing-protocol__step">
            <span className="landing-protocol__num">01</span>
            <div>
              <h3>Create your Certified ID</h3>
              <p>Enter your email. We send a one-time code.</p>
            </div>
          </div>
          <div className="landing-protocol__step">
            <span className="landing-protocol__num">02</span>
            <div>
              <h3>Sign in to partner apps</h3>
              <p>Use it anywhere you see &apos;Sign in with Certified&apos;.</p>
            </div>
          </div>
          <div className="landing-protocol__step">
            <span className="landing-protocol__num">03</span>
            <div>
              <h3>Your profile is already there</h3>
              <p>Your profile and records follow you automatically.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
