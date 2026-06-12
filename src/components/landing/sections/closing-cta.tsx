import HeroCta from "@/components/landing/hero-cta";

/**
 * Closing beat — the page's last section before the site footer.
 * Reprises the hero's invitation for the end user (the convinced
 * skeptic coming out of the FAQ), closing the loop the hero opened:
 * one serif line, the same two CTAs, nothing else.
 */
export default function ClosingCta() {
  return (
    <section className="lp-section lp-closing" aria-labelledby="lp-closing-title">
      <div className="lp-section__inner lp-closing__inner">
        <h2 id="lp-closing-title" className="lp-h2 lp-closing__title">
          Start with your email
        </h2>
        <HeroCta />
      </div>
    </section>
  );
}
