import LpArrow from "@/components/landing/lp-arrow";

/**
 * Footer band — the "Built in the open" statement plus the developer-
 * facing links that don't belong in the body copy. Sits above the
 * global SiteFooter (legal links), which welcome/layout.tsx renders.
 */
export default function FooterBand() {
  return (
    <section className="lp-section lp-footband" aria-label="Built in the open">
      <div className="lp-section__inner lp-footband__inner">
        <div>
          <h2 className="lp-footband__statement">Built in the open.</h2>
          <p className="lp-footband__body">
            Certified runs on open standards and open-source software, so your
            account never depends on one company&apos;s survival.
          </p>
        </div>
        <nav className="lp-footband__links" aria-label="Developer links">
          <a href="https://github.com/hypercerts-org" target="_blank" rel="noopener noreferrer" className="lp-footband__link">
            Open source <LpArrow />
          </a>
          <a href="https://atproto.com" target="_blank" rel="noopener noreferrer" className="lp-footband__link">
            AT Protocol <LpArrow />
          </a>
          <a href="mailto:support@hypercerts.org" className="lp-footband__link">
            Contact
          </a>
        </nav>
      </div>
    </section>
  );
}
