const CONNECTED_APPS = [
  { name: "Bluesky", desc: "Decentralized social networking", icon: "💬", connected: true },
  { name: "Whitewind", desc: "Long-form publishing on AT Protocol", icon: "📡", connected: true },
  { name: "Frontpage", desc: "Link aggregator and community discussions", icon: "📰", connected: true },
  { name: "Smokesignal", desc: "Decentralized events and meetups", icon: "⚡", connected: true },
];

export default function ConnectedAppsList() {
  return (
    <div className="dash-card">
      <div className="connected-apps__header">
        <h3 className="dash-card__title">Connected Apps</h3>
        <span className="connected-apps__count">{CONNECTED_APPS.length} apps</span>
      </div>
      <p className="dash-card__desc">Apps that can access your Certified identity when you sign in.</p>
      <div className="connected-apps__list">
        {CONNECTED_APPS.map((app) => (
          <div key={app.name} className="connected-apps__item">
            <div className="connected-apps__icon">{app.icon}</div>
            <div className="connected-apps__info">
              <p className="connected-apps__name">{app.name}</p>
              <p className="connected-apps__desc">{app.desc}</p>
            </div>
            <span className="connected-apps__status">
              <span className="connected-apps__dot" />
              Connected
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
