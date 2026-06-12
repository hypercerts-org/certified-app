/**
 * Trust section — three verified statements in numbered columns: data
 * ownership + exit rights, the open protocol, and open-source
 * auditability.
 */

const STATEMENTS = [
  {
    num: "01",
    title: "You own it",
    body: "Your data lives in your account, not in any app — including ours. Export or move it any time.",
  },
  {
    num: "02",
    title: "Open protocol",
    body: "Built on and for AT Protocol. Anyone can verify how it works; anyone can build on it.",
  },
  {
    num: "03",
    title: "Auditable by anyone",
    body: "Every component is open source. Security through transparency, not obscurity.",
  },
];

export default function Trust() {
  return (
    <section className="lp-section" aria-labelledby="lp-trust-title">
      <div className="lp-section__inner">
        <header className="lp-section__header">
          <span className="lp-eyebrow">Why it&apos;s trustworthy</span>
          <h2 id="lp-trust-title" className="lp-h2">
            Built so you don&apos;t have to trust us
          </h2>
        </header>
        <div className="lp-trust">
          {STATEMENTS.map((s) => (
            <div key={s.num} className="lp-trust__col lp-item">
              <span className="lp-item__num">{s.num}</span>
              <h3 className="lp-item__title">{s.title}</h3>
              <p className="lp-item__body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
