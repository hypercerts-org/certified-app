export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="landing-section landing-section--subtle"
      aria-labelledby="how-it-works-heading"
    >
      <div className="landing-section__inner">
        <div className="landing-section__header landing-section__header--center">
          <span className="landing-label">How it works</span>
          <h2 id="how-it-works-heading">From sign-up to social proof</h2>
          <p className="landing-protocol__intro">
            Four steps to a profile that earns its place in the world.
          </p>
        </div>
        <div className="landing-protocol__steps">
          <div className="landing-protocol__step">
            <span className="landing-protocol__num">01</span>
            <div>
              <h4>Create your Certified profile</h4>
              <p>Passwordless sign-up via email or your existing atproto handle.</p>
            </div>
          </div>
          <div className="landing-protocol__step">
            <span className="landing-protocol__num">02</span>
            <div>
              <h4>Mint and receive certs</h4>
              <p>Issue certs for work you do or that you witness. Each one is a signed record on the issuer&apos;s repo.</p>
            </div>
          </div>
          <div className="landing-protocol__step">
            <span className="landing-protocol__num">03</span>
            <div>
              <h4>Endorse the people you trust</h4>
              <p>Vouch for a person or for a specific cert. The recipient can accept, reject, or leave it pending — they&apos;re always in control.</p>
            </div>
          </div>
          <div className="landing-protocol__step">
            <span className="landing-protocol__num">04</span>
            <div>
              <h4>Organize into projects</h4>
              <p>Curate related certs into project pages so contributors get credit and your story stays legible.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
