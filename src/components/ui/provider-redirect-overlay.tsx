export default function ProviderRedirectOverlay() {
  return (
    <div
      className="loading-screen"
      style={{ position: "fixed", inset: 0, zIndex: 9999 }}
    >
      <div className="loading-screen__inner">
        <img
          src="/assets/certified_brandmark.svg"
          alt=""
          className="loading-screen__logo"
        />
        <p
          style={{
            color: "white",
            marginTop: "1.5rem",
            fontSize: "1rem",
            opacity: 0.7,
          }}
        >
          Connecting to your provider…
        </p>
      </div>
    </div>
  );
}
