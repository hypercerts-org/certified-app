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
        <p className="mt-6 text-sm text-white/40 font-mono">
          Connecting to your provider...
        </p>
      </div>
    </div>
  );
}
