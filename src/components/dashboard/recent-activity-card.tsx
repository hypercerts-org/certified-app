export default function RecentActivityCard() {
  const activities = [
    { label: "Signed in to Bluesky", time: "2 hours ago", color: "var(--color-error)" },
    { label: "Profile updated", time: "Yesterday", color: "var(--color-accent)" },
    { label: "Connected Whitewind", time: "3 days ago", color: "var(--color-warning)" },
  ];

  return (
    <div className="dash-card">
      <h3 className="dash-card__title">Recent Activity</h3>
      <ul className="dash-card__activity">
        {activities.map((item, i) => (
          <li key={i} className="dash-card__activity-item">
            <span className="dash-card__activity-dot" style={{ background: item.color }} />
            <div>
              <p className="dash-card__activity-label">{item.label}</p>
              <p className="dash-card__activity-time">{item.time}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
