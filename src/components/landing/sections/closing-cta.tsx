import HeroCta from "@/components/landing/hero-cta";
import GuillocheArt from "@/components/landing/guilloche-art";

/**
 * Closing beat — the page's last section before the site footer.
 * Reprises the hero's invitation for the end user (the convinced
 * skeptic coming out of the FAQ), closing the loop the hero opened:
 * one serif line, the same two CTAs, and the hero's morphing plate
 * (flat, own id namespace) fanning around the bottom-left corner.
 */
export default function ClosingCta() {
  return (
    <section className="lp-section lp-closing" aria-labelledby="lp-closing-title">
      <div className="lp-closing__art">
        <GuillocheArt idPrefix="lpgc" flat />
      </div>
      <div className="lp-section__inner lp-closing__inner">
        <h2 id="lp-closing-title" className="lp-h2 lp-closing__title">
          Your recognition starts here
        </h2>
        <p className="lp-closing__sub">Create your account in under a minute.</p>
        <HeroCta />
      </div>
    </section>
  );
}
