import Link from "next/link";

export default function BuiltForTrust() {
  return (
    <section id="built-for-trust" className="landing-section landing-section--dark">
      <div className="landing-section__inner">
        <h2>Built for trust</h2>
        <ul className="landing-trust-list">
          <li>Your account belongs to you.</li>
          <li>You can leave anytime — no lock-in.</li>
          <li>Works across multiple apps — you&apos;re not stuck in one place.</li>
        </ul>
        <div className="landing-trust-sub">
          <h3>Privacy &amp; security</h3>
          <ul>
            <li>One-time email codes — no passwords.</li>
            <li>We don&apos;t sell your personal data.</li>
            <li>Encrypted connections by default.</li>
            <li>Read our <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link>.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
