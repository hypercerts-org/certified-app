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

import { Copy, Lock, Globe, Briefcase, Globe2, UserCircle, Repeat } from "lucide-react";

export default function HeroDiagram() {
  return (
    <div className="hero-diagram" aria-hidden="true">
      {/* Top tag */}
      <div className="hero-diagram__top-tag">Your open identity</div>

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
        {/* Top tag connector to centre */}
        <line x1="400" y1="36" x2="400" y2="100" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
        {/* Centre to bottom caption */}
        <line x1="400" y1="500" x2="400" y2="560" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />

        {/* Left side connectors (3 cards on left) */}
        <path d="M 240 165 L 320 165 L 320 230 L 360 230" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
        <path d="M 240 280 L 360 280" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
        <path d="M 240 395 L 320 395 L 320 330 L 360 330" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />

        {/* Right side connectors (3 cards on right) */}
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
        <div className="hero-diagram__card-pills">
          <span className="hero-diagram__pill">
            <Briefcase size={11} strokeWidth={1.5} /> portable
          </span>
          <span className="hero-diagram__pill">
            <Globe2 size={11} strokeWidth={1.5} /> open
          </span>
          <span className="hero-diagram__pill">
            <UserCircle size={11} strokeWidth={1.5} /> user-owned
          </span>
          <span className="hero-diagram__pill">
            <Repeat size={11} strokeWidth={1.5} /> interoperable
          </span>
        </div>
      </div>

      {/* Lock badge (sits on the blob bottom edge) */}
      <div className="hero-diagram__lock" aria-hidden="true">
        <Lock size={18} strokeWidth={1.5} />
      </div>

      {/* Partner app cards (left column) */}
      <div className="hero-diagram__app hero-diagram__app--lt">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <ButterflyIcon />
        </span>
        Bluesky
      </div>
      <div className="hero-diagram__app hero-diagram__app--lm">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <FeedIcon />
        </span>
        SkyFeed
      </div>
      <div className="hero-diagram__app hero-diagram__app--lb">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <WindIcon />
        </span>
        WhiteWind
      </div>

      {/* Partner app cards (right column) */}
      <div className="hero-diagram__app hero-diagram__app--rt">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <BoltIcon />
        </span>
        Flashes
      </div>
      <div className="hero-diagram__app hero-diagram__app--rm">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <DocIcon />
        </span>
        Frontpage
      </div>
      <div className="hero-diagram__app hero-diagram__app--rb">
        <span className="hero-diagram__app-icon" aria-hidden="true">
          <SignalIcon />
        </span>
        Smoke Signal
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

function ButterflyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4c4 1 7 4 9 7 2-3 5-6 9-7-1 5-3 9-9 11C6 13 4 9 3 4z" />
      <path d="M12 11v9" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function WindIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h13a3 3 0 1 0-3-3" />
      <path d="M3 12h17a3 3 0 1 1-3 3" />
      <path d="M3 16h11" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
    </svg>
  );
}
