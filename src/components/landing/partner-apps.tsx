import Image from "next/image";
import ContactCta from "@/components/landing/contact-cta";
import LpArrow from "@/components/landing/lp-arrow";
import { APPS } from "@/lib/apps";

/**
 * "Works with": the apps where a Certified account already signs you in, as
 * a hairline-divided wall, with the recruiting line for the next platform
 * under it.
 */
export default function PartnerApps() {
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
          {APPS.map((app) => (
            <a
              key={app.name}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-apps__cell"
            >
              <Image src={app.logo} alt="" width={32} height={32} className="lp-apps__logo" />
              <span className="lp-apps__name">{app.name}</span>
              <span className="lp-apps__desc">{app.tagline}</span>
            </a>
          ))}
        </div>
        <p className="lp-apps__recruit">
          Running a funding platform or grants program? Your system could plug into this network.{" "}
          <ContactCta className="lp-link">
            Get in touch <LpArrow />
          </ContactCta>
        </p>
      </div>
    </section>
  );
}
