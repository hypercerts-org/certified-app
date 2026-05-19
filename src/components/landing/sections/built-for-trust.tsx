export default function BuiltForTrust() {
  return (
    <section
      id="built-for-trust"
      className="landing-section landing-section--dark landing-section--pattern"
      aria-labelledby="built-for-trust-heading"
    >
      <div className="landing-section__pattern landing-section__pattern--light" aria-hidden="true">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid-trust" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-trust)" />
        </svg>
      </div>
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <span className="landing-label landing-label--light">Our principles</span>
          <h2 id="built-for-trust-heading">Built for trust</h2>
        </div>
        <div className="landing-trust">
          <div className="landing-trust__item">
            <div className="landing-trust__check" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <div>
              <h4>Open protocol</h4>
              <p>Built on AT Protocol — the same open standard powering Bluesky. No private silos, no gated APIs.</p>
            </div>
          </div>
          <div className="landing-trust__item">
            <div className="landing-trust__check" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h4>Your records, your profile</h4>
              <p>Every achievement, endorsement, and project is a signed record stored on your own atproto repository. Portable by design.</p>
            </div>
          </div>
          <div className="landing-trust__item">
            <div className="landing-trust__check" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </div>
            <div>
              <h4>Leave anytime</h4>
              <p>Take your data with you. No vendor lock-in, no platform-tax extraction, no "graveyard mode."</p>
            </div>
          </div>
          <div className="landing-trust__item">
            <div className="landing-trust__check" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4" />
                <path d="M21 12c.552 0 1-.448 1-1V6.5a1 1 0 0 0-.658-.94l-9-3.25a1 1 0 0 0-.684 0l-9 3.25A1 1 0 0 0 2 6.5V11c0 5 3.5 9 10 11 6.5-2 10-6 10-11Z" />
              </svg>
            </div>
            <div>
              <h4>Endorsements with consent</h4>
              <p>You decide what shows up on your profile. Accept, reject, or leave any endorsement pending.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
