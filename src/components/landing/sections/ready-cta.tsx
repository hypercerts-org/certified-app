"use client";

import { useAuth } from "@/lib/auth/auth-context";

export default function ReadyCta() {
  const { openSignIn, openSignUp } = useAuth();

  return (
    <section id="ready-cta" className="landing-section landing-section--dark">
      <div className="landing-section__inner landing-cta">
        <h2>Ready to get started?</h2>
        <p>Create your account in under a minute — no passwords.</p>
        <div className="landing-cta__actions">
          <button className="hero__btn-primary" onClick={openSignUp}>
            <img src="/assets/certified_brandmark.svg" alt="" className="hero__btn-icon" />
            Sign in with Certified
          </button>
          <button className="hero__btn-secondary" onClick={openSignIn}>
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}
