export default function WhatYouGet() {
  return (
    <section id="what-you-get" className="landing-section landing-section--light">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <span className="landing-label">Your Benefits</span>
          <h2>What you get</h2>
        </div>
        <div className="landing-bento">
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h3>One account across apps</h3>
            <p>Use the same account on every partner platform. No new logins.</p>
          </div>
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <h3>Your profile travels with you</h3>
            <p>Your data and activity appear when you sign in to a new app.</p>
          </div>
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h3>You stay in control</h3>
            <p>You can leave anytime. You&apos;re not locked in.</p>
          </div>
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            </div>
            <h3>Simple sign-in</h3>
            <p>No passwords. We email you a one-time code.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
