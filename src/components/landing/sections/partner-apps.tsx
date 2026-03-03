import React from "react";
import Image from "next/image";
import { CONNECTED_APPS } from "@/lib/constants/apps";

export default function PartnerApps() {
  return (
    <section id="partner-apps" className="landing-section landing-section--gray">
      <div className="landing-section__inner">
        <h2>Works across partner apps</h2>
        <p className="landing-prose">Use your Certified ID anywhere you see &lsquo;Sign in with Certified&rsquo;.</p>
        <div className="landing-partners">
          {CONNECTED_APPS.map((app) => (
            <div key={app.name} className="landing-chip">
              <Image src={app.logo} alt="" width={36} height={36} className="landing-chip__logo" />
              <div className="landing-chip__text">
                <span className="landing-chip__name">{app.name}</span>
                <span className="landing-chip__desc">{app.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="landing-footnote">More apps coming soon.</p>
      </div>
    </section>
  );
}
