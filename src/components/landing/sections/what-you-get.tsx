export default function WhatYouGet() {
  return (
    <section id="what-you-get" className="landing-section landing-section--light">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2>What you get</h2>
        </div>
        <div className="landing-bento">
          <div className="landing-bento__card landing-bento__card--highlight">
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
          <div className="landing-bento__card landing-bento__card--flipped">
            <p>We email you a one-time code.</p>
            <h3>No passwords.</h3>
          </div>
        </div>
      </div>
    </section>
  );
}
