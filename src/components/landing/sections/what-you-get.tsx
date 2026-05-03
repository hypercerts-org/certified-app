export default function WhatYouGet() {
  return (
    <section id="what-you-get" className="landing-section landing-section--light">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <span className="landing-label">Your Benefits</span>
          <h2>What you get</h2>
        </div>
        <div className="landing-bento">
          {/* All four cards are uniform — minimal cream surface, the
              accent only shows up on the icon stroke. No highlight
              card; let the typography carry the rhythm. */}
          <div className="landing-bento__card">
            <div className="landing-bento__icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h3>One account across apps</h3>
            <p>Use the same account on every partner platform. No new logins, no juggling profiles.</p>
          </div>
          <div className="landing-bento__card">
            <div className="landing-bento__icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <h3>Your profile travels with you</h3>
            <p>Your handle, avatar, and history appear automatically when you sign in to a new app.</p>
          </div>
          <div className="landing-bento__card">
            <div className="landing-bento__icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h3>You stay in control</h3>
            <p>Export your data or walk away at any time. You&apos;re never locked in.</p>
          </div>
          <div className="landing-bento__card">
            <div className="landing-bento__icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
            </div>
            <h3>Simple sign-in</h3>
            <p>No passwords to remember. We email you a one-time code each time you sign in.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
