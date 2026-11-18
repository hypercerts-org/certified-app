import GuillocheArt from "@/components/landing/guilloche-art";
import HeroCta from "@/components/landing/hero-cta";

/**
 * Landing hero. Asymmetric two-column composition: copy in the left
 * five columns, the guilloche rosette bleeding off the right edge.
 * Below 800px the artwork sits behind the top of the stacked copy, so
 * the buttons and the way into the network fit on the first screen.
 */
export default function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-hero__art">
        <GuillocheArt />
      </div>
      <div className="lp-section__inner lp-hero__inner">
        <div className="lp-hero__copy">
          <span className="lp-eyebrow lp-hero__reveal">Built on AT Protocol</span>
          <h1 id="lp-hero-title" className="lp-hero__title lp-hero__reveal">
            One account.
            <br />
            Your work.
            <br />
            Recognized everywhere.
          </h1>
          <p className="lp-hero__subline lp-hero__reveal">
            Certified is where your profile, your work, and your supporters live — independent of
            any single platform. Sign in once, and it works across every app in the network.
          </p>
          <div className="lp-hero__reveal">
            <HeroCta explore />
            <p className="lp-hero__recognition">
              Already used Certified on another app? Same email, same account. Enter it and
              you&apos;re in. No password needed.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
