"use client";

import React from "react";
import Link from "next/link";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Something went wrong</h1>
      </div>
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          <div className="dash-card">
            <p className="dash-card__desc">An unexpected error occurred.</p>
            {error.digest && (
              <p className="dash-card__desc" style={{ fontSize: "0.85em", opacity: 0.7 }}>
                Reference: {error.digest}
              </p>
            )}
            <button onClick={reset} className="dashboard__back-btn" style={{ marginBottom: "0.5rem" }}>
              Try again
            </button>
            <Link href="/" className="dashboard__back-btn">
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
