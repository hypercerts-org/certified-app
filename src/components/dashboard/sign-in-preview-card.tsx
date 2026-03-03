export default function SignInPreviewCard() {
  return (
    <div className="dash-card">
      <h3 className="dash-card__title">Sign in with Certified</h3>
      <p className="dash-card__desc">
        Use your Certified identity to sign in to any app in the AT Protocol ecosystem. Your data and identity travel with you.
      </p>
      <div className="dash-card__preview">
        <p className="dash-card__preview-label">Look out for</p>
        <div className="dash-card__preview-btn">
          <img src="/assets/certified_brandmark.svg" alt="" className="dash-card__preview-icon" />
          Sign in with Certified
        </div>
      </div>
    </div>
  );
}
