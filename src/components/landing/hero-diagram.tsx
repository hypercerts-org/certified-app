/**
 * Hero diagram — the right-hand visual on the landing hero.
 *
 * Editorial portrait of the Certified identity at the centre of the open
 * web: a watercolor blue blob backdrop, a cream identity card with a
 * globe, a handle, a DID, four pill chips, and a lock; six partner-app
 * cards floating left/right connected by dotted lines with `+` joints;
 * a "Your open identity" tag at top, a caption at the bottom, a vertical
 * "OPEN WEB" rail at the right edge.
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
          Mix-blend-multiply lets the white paper background blend into
          our off-white page surface so only the pigment shows. */}
      <img
        src="/assets/watercolor-blue-circle.png"
        alt=""
        className="hero-diagram__blob"
        aria-hidden="true"
      />

      {/* Dotted connector lines layer (positioned absolutely, behind cards) */}
      <svg
        className="hero-diagram__lines"
        viewBox="0 0 800 600"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Centre to bottom caption */}
        <line x1="400" y1="500" x2="400" y2="560" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />

        {/* Left side connectors (3 cards on left) */}
        <path d="M 240 165 L 320 165 L 320 230 L 360 230" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
        <path d="M 240 280 L 360 280" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
        <path d="M 240 395 L 320 395 L 320 330 L 360 330" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />

        {/* Right side connectors (3 cards on right — two real partner
           apps + an open "Your app" slot signalling more partners are
           welcome) */}
        <path d="M 560 165 L 480 165 L 480 230 L 440 230" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
        <path d="M 560 280 L 440 280" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
        <path d="M 560 395 L 480 395 L 480 330 L 440 330" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />

        {/* Plus joints at line corners */}
        <g stroke="currentColor" strokeWidth="1" strokeLinecap="round">
          {/* Left-top corner */}
          <line x1="316" y1="161" x2="324" y2="161" />
          <line x1="320" y1="157" x2="320" y2="165" />
          {/* Left-top inner */}
          <line x1="316" y1="226" x2="324" y2="226" />
          <line x1="320" y1="222" x2="320" y2="230" />
          {/* Left-bottom corner */}
          <line x1="316" y1="395" x2="324" y2="395" />
          <line x1="320" y1="391" x2="320" y2="399" />
          {/* Left-bottom inner */}
          <line x1="316" y1="330" x2="324" y2="330" />
          <line x1="320" y1="326" x2="320" y2="334" />
          {/* Right-top corner */}
          <line x1="476" y1="161" x2="484" y2="161" />
          <line x1="480" y1="157" x2="480" y2="165" />
          {/* Right-top inner */}
          <line x1="476" y1="226" x2="484" y2="226" />
          <line x1="480" y1="222" x2="480" y2="230" />
          {/* Right-bottom corner */}
          <line x1="476" y1="395" x2="484" y2="395" />
          <line x1="480" y1="391" x2="480" y2="399" />
          {/* Right-bottom inner */}
          <line x1="476" y1="330" x2="484" y2="330" />
          <line x1="480" y1="326" x2="480" y2="334" />
        </g>
      </svg>

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

/* ───── tiny inline icons (kept here so the diagram is self-contained) */


