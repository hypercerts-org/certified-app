export default function HowItWorks() {
  return (
    <section id="how-it-works" className="landing-section landing-section--dark">
      <div className="landing-section__inner">
        <h2>How it works</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step__number">1</div>
            <h3>Create your Certified ID</h3>
            <p>Enter your email. We send a one-time code.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step__number">2</div>
            <h3>Sign in to partner apps</h3>
            <p>Use it anywhere you see &apos;Sign in with Certified&apos;.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step__number">3</div>
            <h3>Your profile is already there</h3>
            <p>Your profile and records follow you automatically.</p>
          </div>
        </div>
        <p className="landing-reassurance">That&apos;s it — no extra setup.</p>
      </div>
    </section>
  );
}
