import Brandmark from "@/components/ui/brandmark";

export default function ProviderRedirectOverlay() {
  return (
    <div
      className="loading-screen"
      style={{ position: "fixed", inset: 0, zIndex: 9999 }}
    >
      <div className="loading-screen__inner">
        <Brandmark title="" className="loading-screen__logo" />
        <p className="mt-6 text-sm font-sans tracking-wide" style={{ color: "var(--fg-muted)" }}>
          Redirecting...
        </p>
      </div>
    </div>
  );
}
