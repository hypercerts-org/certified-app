import Image from "next/image";
import { CONNECTED_APPS } from "@/lib/constants/apps";

export default function PartnerApps() {
  return (
    <section id="partner-apps" className="landing-section landing-section--light">
      <div className="landing-section__inner">
        <div className="landing-section__header landing-section__header--center">
          <span className="landing-label">Ecosystem</span>
          <h2>Works across partner apps</h2>
        </div>
        <div className="landing-network">
          {CONNECTED_APPS.map((app) => (
            <div
              key={app.name}
              className="landing-network__cell"
            >
              <Image
                src={app.logo}
                alt={`${app.name} logo`}
                width={40}
                height={40}
                className="landing-network__logo"
              />
              <span className="landing-network__name">{app.name}</span>
              <span className="landing-network__desc">{app.desc}</span>
            </div>
          ))}
        </div>
        <p className="landing-footnote landing-footnote--center">More apps coming soon.</p>
      </div>
    </section>
  );
}
