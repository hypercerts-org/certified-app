import React from "react";

export default function PartnerApps() {
  return (
    <section id="partner-apps" className="landing-section landing-section--gray">
      <div className="landing-section__inner">
        <h2>Works across partner apps</h2>
        <p className="landing-prose">Use your Certified ID anywhere you see &lsquo;Sign in with Certified&rsquo;.</p>
        <div className="landing-partners">
          <div className="landing-chip">
            <img src="/assets/partners/maearth_logo.jpeg" alt="" className="landing-chip__logo" />
            <div className="landing-chip__text">
              <span className="landing-chip__name">Ma Earth</span>
              <span className="landing-chip__desc">Collective Funding for Regenerating Earth</span>
            </div>
          </div>
          <div className="landing-chip">
            <img src="/assets/partners/gainforest_logo.jpeg" alt="" className="landing-chip__logo" />
            <div className="landing-chip__text">
              <span className="landing-chip__name">GainForest</span>
              <span className="landing-chip__desc">Co-creating a fair future for nature stewards</span>
            </div>
          </div>
          <div className="landing-chip">
            <img src="/assets/partners/silvi_logo.jpeg" alt="" className="landing-chip__logo" />
            <div className="landing-chip__text">
              <span className="landing-chip__name">Silvi</span>
              <span className="landing-chip__desc">Planting the right trees in the right place at the right time</span>
            </div>
          </div>
          <div className="landing-chip">
            <img src="/assets/hyperboards_brandmark.webp" alt="" className="landing-chip__logo" />
            <div className="landing-chip__text">
              <span className="landing-chip__name">Hyperboards</span>
              <span className="landing-chip__desc">Visualizing and recognizing those who create real value</span>
            </div>
          </div>
        </div>
        <p className="landing-footnote">More apps coming soon.</p>
      </div>
    </section>
  );
}
