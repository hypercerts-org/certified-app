import { Users, User, Lock, LogIn } from "lucide-react";

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
              <Users size={32} strokeWidth={1.5} aria-hidden />
            </div>
            <h3>One account across apps</h3>
            <p>Use the same account on every partner platform. No new logins.</p>
          </div>
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <User size={32} strokeWidth={1.5} aria-hidden />
            </div>
            <h3>Your profile travels with you</h3>
            <p>Your data and activity appear when you sign in to a new app.</p>
          </div>
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <Lock size={32} strokeWidth={1.5} aria-hidden />
            </div>
            <h3>You stay in control</h3>
            <p>You can leave anytime. You&apos;re not locked in.</p>
          </div>
          <div className="landing-bento__card">
            <div className="landing-bento__icon">
              <LogIn size={32} strokeWidth={1.5} aria-hidden />
            </div>
            <h3>Simple sign-in</h3>
            <p>No passwords. We email you a one-time code.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
