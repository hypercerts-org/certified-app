/**
 * Hero diagram — the right-hand visual on the landing hero.
 *
 * Editorial portrait of the Certified identity at the centre of the open
 * web: a watercolor blue blob backdrop, a cream identity card with a
 * globe, a handle, a DID, four pill chips, and a lock; six partner-app
 * cards floating left/right; a caption at the bottom and a vertical
 * "ONE ACCOUNT" rail at the right edge.
 *
 * Pure decoration — no inputs, no interactivity. Sized for a desktop
 * 12-col split, collapses cleanly on tablet/mobile via CSS.
 */

import { Copy, Lock, Globe, Sprout, Trees, Vote, Trophy, Plus } from "lucide-react";

export default function HeroDiagram() {
  return (
    <div className="hero-diagram" aria-hidden="true">
      {/* Watercolor blue circle — a real painted PNG (generated via
          openai_image, saved into the repo) rather than an SVG ellipse.
          The PNG carries a real alpha channel (white paper matted out
          via `255 - min(r,g,b)`), so the cream surface and the hero
          grid pattern show through cleanly behind the blob. */}
      <img
        src="/assets/watercolor-blue-circle.png"
        alt=""
        className="hero-diagram__blob"
        aria-hidden="true"
      />

      {/* Centre identity card */}
      <div className="hero-diagram__card">
        <div className="hero-diagram__card-globe" aria-hidden="true">
          <Globe size={32} strokeWidth={1.25} />
        </div>
        <p className="hero-diagram__card-name">alexlee.dev</p>
        <p className="hero-diagram__card-uri">at://alexlee.dev</p>
        <div className="hero-diagram__card-did">
          <span>did:plc:7c6u…xly7</span>
          <Copy size={12} strokeWidth={1.5} />
        </div>
      </div>

      {/* Lock badge (sits on the blob bottom edge) */}
      <div className="hero-diagram__lock" aria-hidden="true">
        <Lock size={18} strokeWidth={1.5} />
      </div>

      {/* Partner app cards (left column — Bluesky with the official
         butterfly mark + first two Certified partner apps) */}
      <div className="hero-diagram__app hero-diagram__app--lt">
        <span className="hero-diagram__app-icon hero-diagram__app-icon--bluesky" aria-hidden="true">
          <img src="/assets/partners/bluesky_logo.svg" alt="" width={16} height={16} />
        </span>
        Bluesky
      </div>
      <div className="hero-diagram__app hero-diagram__app--lm">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <Sprout size={16} strokeWidth={1.5} />
        </span>
        Ma Earth
      </div>
      <div className="hero-diagram__app hero-diagram__app--lb">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <Trees size={16} strokeWidth={1.5} />
        </span>
        GainForest
      </div>

      {/* Partner app cards (right column — remaining two Certified
         partner apps + an open "Your app" slot that signals the
         ecosystem is open to new partners) */}
      <div className="hero-diagram__app hero-diagram__app--rt">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <Vote size={16} strokeWidth={1.5} />
        </span>
        Simocracy
      </div>
      <div className="hero-diagram__app hero-diagram__app--rm hero-diagram__app--placeholder">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <Plus size={16} strokeWidth={1.5} />
        </span>
        Your app
      </div>
      <div className="hero-diagram__app hero-diagram__app--rb">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <Trophy size={16} strokeWidth={1.5} />
        </span>
        Hyperboards
      </div>

      {/* Bottom caption */}
      <p className="hero-diagram__caption">
        Your data. Your control.
        <br />
        In every app you use.
      </p>

    </div>
  );
}

