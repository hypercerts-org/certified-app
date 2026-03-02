import React from "react";

export default function PartnerApps() {
  return (
    <section id="partner-apps" className="landing-section landing-section--gray">
      <div className="landing-section__inner">
        <h2>Works across partner apps</h2>
        <p className="landing-prose">Use your Certified ID anywhere you see &lsquo;Sign in with Certified&rsquo;.</p>
        <div className="landing-partners">
          <span className="landing-chip">
            <img src="/assets/partners/maearth_logo.jpeg" alt="" className="landing-chip__logo" />
            Ma Earth
          </span>
          <span className="landing-chip">
            <img src="/assets/partners/gainforest_logo.jpeg" alt="" className="landing-chip__logo" />
            GainForest
          </span>
          <span className="landing-chip">
            Hyperboards
          </span>
          <span className="landing-chip">
            <img src="/assets/partners/silvi_logo.jpeg" alt="" className="landing-chip__logo" />
            Silvi
          </span>
        </div>
        <p className="landing-footnote">More apps are joining over time.</p>
      </div>
    </section>
  );
}
