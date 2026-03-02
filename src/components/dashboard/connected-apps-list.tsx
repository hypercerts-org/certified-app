const CONNECTED_APPS = [
  { name: "Ma Earth", desc: "Collective Funding for Regenerating Earth", logo: "/assets/partners/maearth_logo.jpeg" },
  { name: "GainForest", desc: "Co-creating a fair future for nature stewards", logo: "/assets/partners/gainforest_logo.jpeg" },
  { name: "Silvi", desc: "Planting the right trees in the right place at the right time", logo: "/assets/partners/silvi_logo.jpeg" },
  { name: "Hyperboards", desc: "Visualizing and recognizing those who create real value", logo: "/assets/hyperboards_brandmark.webp" },
];

export default function ConnectedAppsList() {
  return (
    <div className="dash-card">
      <div className="connected-apps__header">
        <h3 className="dash-card__title">Connected Apps</h3>
        <span className="connected-apps__count">{CONNECTED_APPS.length} apps</span>
      </div>
      <p className="dash-card__desc">Apps you can sign in to with your Certified identity.</p>
      <div className="connected-apps__list">
        {CONNECTED_APPS.map((app) => (
          <div key={app.name} className="connected-apps__item">
            <div className="connected-apps__icon">
              <img src={app.logo} alt="" className="connected-apps__logo" />
            </div>
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
