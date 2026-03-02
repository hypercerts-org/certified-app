import { CheckCircle } from "lucide-react";

export default function IdentityOverviewCard() {
  return (
    <div className="dash-card">
      <h3 className="dash-card__title">Identity Overview</h3>
      <ul className="dash-card__stats">
        <li>
          <span>Connected Apps</span>
          <span className="dash-card__stat-value">12</span>
        </li>
        <li>
          <span>Data Repositories</span>
          <span className="dash-card__stat-value">3</span>
        </li>
        <li>
          <span>Sign-ins (30d)</span>
          <span className="dash-card__stat-value dash-card__stat-value--accent">47</span>
        </li>
        <li>
          <span>Identity Verified</span>
          <span className="dash-card__stat-badge">
            <CheckCircle size={14} />
            Verified
          </span>
        </li>
      </ul>
    </div>
  );
}
