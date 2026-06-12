/**
 * "What lives here" — the three things a Certified account holds.
 * Header in the left columns, three numbered rows divided by hairlines
 * on the right, each with a small seal-grammar glyph.
 */

const ITEMS = [
  {
    num: "01",
    title: "Your profile",
    body: "Who you are and what you work on, in one place. Edit it once; it updates everywhere it's used.",
    glyph: (
      // One identity: a ring with a single signature arc and a center mark.
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="0.75" opacity="0.28" />
        <path d="M 32 10 A 22 22 0 0 1 51 21" stroke="currentColor" strokeWidth="1.25" opacity="0.9" strokeLinecap="round" />
        <circle cx="32" cy="32" r="3" fill="currentColor" opacity="0.9" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Your record",
    body: "The projects you've run, the funding you've received, the work you've published. It stays yours and moves with you, whichever apps come and go.",
    glyph: (
      // A record accumulating: stacked layers, newest on top.
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <rect x="12" y="38" width="40" height="12" rx="1" stroke="currentColor" strokeWidth="0.75" opacity="0.14" />
        <rect x="12" y="31" width="40" height="12" rx="1" stroke="currentColor" strokeWidth="0.75" opacity="0.28" />
        <rect x="12" y="24" width="40" height="12" rx="1" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
        <rect x="12" y="17" width="40" height="12" rx="1" stroke="currentColor" strokeWidth="1.25" opacity="0.9" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Your supporters",
    body: "Endorsements from partners, funders, and organizations that know your work. Signed, checkable, and attached to the work itself — not to a website that might disappear.",
    glyph: (
      // Endorsers connected to each other, one countersigned.
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <path d="M 32 24 L 17 42 M 32 24 L 47 42 M 17 42 L 47 42" stroke="currentColor" strokeWidth="0.75" opacity="0.28" />
        <circle cx="32" cy="16" r="10" stroke="currentColor" strokeWidth="1.25" opacity="0.9" />
        <circle cx="14" cy="46" r="10" stroke="currentColor" strokeWidth="0.75" opacity="0.28" />
        <circle cx="50" cy="46" r="10" stroke="currentColor" strokeWidth="0.75" opacity="0.28" />
        <circle cx="32" cy="16" r="2.5" fill="currentColor" opacity="0.9" />
      </svg>
    ),
  },
];

export default function WhatLivesHere() {
  return (
    <section className="lp-section" aria-labelledby="lp-holdings-title">
      <div className="lp-section__inner lp-split">
        <header className="lp-split__head">
          <span className="lp-eyebrow">What lives here</span>
          <h2 id="lp-holdings-title" className="lp-h2">
            Your Certified account holds three things
          </h2>
        </header>
        <div className="lp-split__body">
          {ITEMS.map((item) => (
            <div key={item.num} className="lp-holdings__row">
              <div className="lp-item">
                <span className="lp-item__num">{item.num}</span>
                <h3 className="lp-item__title">{item.title}</h3>
                <p className="lp-item__body">{item.body}</p>
              </div>
              <div className="lp-holdings__glyph">{item.glyph}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
