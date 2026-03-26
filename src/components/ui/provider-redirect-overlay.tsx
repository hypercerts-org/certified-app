export default function ProviderRedirectOverlay() {
  return (
    <div
      className="loading-screen"
      style={{ position: "fixed", inset: 0, zIndex: 9999 }}
    >
      <div className="loading-screen__inner">
        <img
          src="/assets/certified_brandmark_black.svg"
          alt=""
          className="loading-screen__logo"
        />
        <p className="mt-6 text-sm text-black/30 font-sans tracking-wide">
          Redirecting...
        </p>
      </div>
    </div>
  );
}
