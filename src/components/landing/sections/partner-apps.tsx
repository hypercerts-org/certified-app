import Image from "next/image";
import { CONNECTED_APPS } from "@/lib/constants/apps";
import LpArrow from "@/components/landing/lp-arrow";
import ContactCta from "@/components/landing/contact-cta";

/**
 * "Works with" — the apps where a Certified account already signs you
 * in, as a hairline-divided wall (1px gaps over a rule-colored
 * backdrop, no card chrome). Ma Earth leads as the founding
 * deployment; the recruiting line for the next platform sits under
 * the wall.
 */
export default function PartnerApps() {
  const apps = CONNECTED_APPS.filter((app) => app.name !== "Hyperboards");

  return (
    <section id="partner-apps" className="lp-section" aria-labelledby="lp-apps-title">
      <div className="lp-section__inner">
        <header className="lp-section__header">
          <span className="lp-eyebrow">Ecosystem</span>
          <h2 id="lp-apps-title" className="lp-h2">
            Works with
          </h2>
        </header>
        <div className="lp-apps">
          {apps.map((app) => (
            <a
              key={app.name}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-apps__cell"
            >
              <Image
                src={app.logo}
                alt=""
                width={32}
                height={32}
                className="lp-apps__logo"
              />
              <span className="lp-apps__name">{app.name}</span>
              <span className="lp-apps__desc">{app.desc}</span>
            </a>
          ))}
        </div>
        <p className="lp-apps__recruit">
          Running a funding platform or grants program? Your system could plug
          into this network.{" "}
          <ContactCta className="lp-link">
            Get in touch <LpArrow />
          </ContactCta>
        </p>
      </div>
    </section>
  );
}
