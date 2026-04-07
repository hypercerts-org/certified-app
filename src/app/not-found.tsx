import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFoundPage() {
  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Page not found</h1>
      </div>
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          <div className="dash-card">
            <p className="dash-card__desc">The page you&apos;re looking for doesn&apos;t exist.</p>
            <Link href="/welcome" className="dashboard__back-btn">
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
