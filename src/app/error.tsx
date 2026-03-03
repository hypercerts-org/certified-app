"use client";

import React from "react";
import Link from "next/link";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error }: ErrorPageProps) {
  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Something went wrong</h1>
      </div>
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          <div className="dash-card">
            <p className="dash-card__desc">{error.message || "An unexpected error occurred."}</p>
            <Link href="/" className="dashboard__back-btn">
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
