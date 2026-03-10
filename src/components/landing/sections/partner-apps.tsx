import React from "react";
import Image from "next/image";
import { CONNECTED_APPS } from "@/lib/constants/apps";

export default function PartnerApps() {
  return (
    <section id="partner-apps" className="landing-section landing-section--light">
      <div className="landing-section__inner">
        <h2>Works across partner apps</h2>
        <p className="landing-prose">Use your Certified ID anywhere you see &lsquo;Sign in with Certified&rsquo;.</p>
        <div className="landing-partners">
          {CONNECTED_APPS.map((app) => (
            <div key={app.name} className="landing-partner">
              <Image src={app.logo} alt={`${app.name} logo`} width={40} height={40} className="landing-partner__logo" />
              <div className="landing-partner__text">
                <span className="landing-partner__name">{app.name}</span>
                <span className="landing-partner__desc">{app.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="landing-footnote">More apps coming soon.</p>
      </div>
    </section>
  );
}
