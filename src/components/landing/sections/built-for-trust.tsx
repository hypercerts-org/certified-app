export default function BuiltForTrust() {
  return (
    <section id="built-for-trust" className="landing-section landing-section--dark landing-section--pattern">
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
          <span className="landing-label landing-label--light">Our Principles</span>
          <h2>Built for trust</h2>
        </div>
        <div className="landing-trust">
          <div className="landing-trust__item">
            <div className="landing-trust__check">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div>
              <h4>Open protocol</h4>
              <p>Built on and for AT Protocol. Anyone can verify how it works, anyone can build on it.</p>
            </div>
          </div>
          <div className="landing-trust__item">
            <div className="landing-trust__check">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            </div>
            <div>
              <h4>No lock-in</h4>
              <p>Your identity and data move with you. Switch apps, export everything, or walk away entirely.</p>
            </div>
          </div>
          <div className="landing-trust__item">
            <div className="landing-trust__check">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div>
              <h4>Auditable by anyone</h4>
              <p>Every component is open source. Security through transparency, not obscurity.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
