import React from "react";
import Link from "next/link";

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
            <Link href="/" className="dashboard__back-btn">
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
