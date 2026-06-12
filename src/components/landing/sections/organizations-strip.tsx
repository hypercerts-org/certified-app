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
    body: "Projects arrive pre-diligenced, with verified records you can evaluate in minutes. Your own diligence joins the record and compounds for the next funder.",
  },
  {
    title: "Platforms",
    body: "Run calls, applications, and payouts on shared rails. You keep your process; participants arrive with accounts, records, and supporters from day one.",
  },
  {
    title: "Awards & networks",
    body: "Your rigorous selection ends as a logo in a bio. Issue it as signed endorsements instead: portable, checkable, attached to the work.",
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
          Lower the cost of trust
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
