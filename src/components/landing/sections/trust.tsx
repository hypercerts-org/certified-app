/**
 * Trust section — three verified statements in numbered columns.
 * All three are true of the actual product: data lives in the user's
 * own account, export/migration is supported, infrastructure is
 * EU-hosted.
 */

const STATEMENTS = [
  {
    num: "01",
    title: "You own it",
    body: "Your data sits in your own account, not inside any app — including ours.",
  },
  {
    num: "02",
    title: "You can leave",
    body: "Export everything or move your account to another provider, any time. We built it so that you don't have to trust us.",
  },
  {
    num: "03",
    title: "It stays in Europe",
    body: "Your account is hosted on servers in the EU, under European privacy law.",
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
