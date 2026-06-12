import { GuillocheQuiet } from "@/components/landing/guilloche-art";
import ContactCta from "@/components/landing/contact-cta";

/**
 * The organizations strip — the page's single "color" moment: a
 * full-bleed polarity inversion (--color-navy band, --color-off-white
 * ink; the pair swaps the other way in dark mode, so the band reads
 * as a flip in both themes). Three professional audiences as text
 * columns, one shared contact CTA, and a quiet static echo of the
 * hero seal in the background.
 */

const AUDIENCES = [
  {
    title: "Funders",
    body: "Evaluate projects on their full, checkable record — or plug verified profiles into your own process.",
  },
  {
    title: "Platforms",
    body: "Build your app on accounts users already have, with profiles and histories included from day one.",
  },
  {
    title: "Awards & networks",
    body: "Issue your recognition as a checkable badge that travels with the people you've selected.",
  },
];

export default function OrganizationsStrip() {
  return (
    <section className="lp-band" aria-labelledby="lp-band-title">
      <div className="lp-band__seal">
        <GuillocheQuiet />
      </div>
      <div className="lp-section__inner lp-band__inner">
        <span className="lp-eyebrow lp-band__eyebrow">For organizations</span>
        <h2 id="lp-band-title" className="lp-h2 lp-band__title">
          Certified also works for the organizations around these projects
        </h2>
        <div className="lp-band__cols">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="lp-band__col">
              <h3 className="lp-band__col-title">{a.title}</h3>
              <p className="lp-band__col-body">{a.body}</p>
            </div>
          ))}
        </div>
        <ContactCta className="lp-btn lp-band__cta">Get in touch</ContactCta>
      </div>
    </section>
  );
}
