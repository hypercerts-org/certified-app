import { Globe, LogIn, Eye } from "lucide-react";

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
              <Globe size={20} strokeWidth={2} aria-hidden />
            </div>
            <div>
              <h4>Open protocol</h4>
              <p>Built on and for AT Protocol. Anyone can verify how it works, anyone can build on it.</p>
            </div>
          </div>
          <div className="landing-trust__item">
            <div className="landing-trust__check">
              <LogIn size={20} strokeWidth={2} aria-hidden />
            </div>
            <div>
              <h4>No lock-in</h4>
              <p>Your identity and data move with you. Switch apps, export everything, or walk away entirely.</p>
            </div>
          </div>
          <div className="landing-trust__item">
            <div className="landing-trust__check">
              <Eye size={20} strokeWidth={2} aria-hidden />
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
