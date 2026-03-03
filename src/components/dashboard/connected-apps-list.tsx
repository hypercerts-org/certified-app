import { CONNECTED_APPS } from "@/lib/constants/apps";

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
