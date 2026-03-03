"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { authFetch } from "@/lib/auth/fetch";
import AuthGuard from "@/components/layout/auth-guard";
import LoadingSpinner from "@/components/ui/loading-spinner";

const COLLECTION = "org.hypercerts.claim.activity";

interface ClaimRecord {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
}

export default function MyDataPage() {
  const { did } = useAuth();
  const [records, setRecords] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!did) return;

    const fetchRecords = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await authFetch(
          `/api/xrpc/com/atproto/repo/listRecords?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(COLLECTION)}&limit=100`
        );
        if (!res.ok) {
          // If 400 or similar, the collection may just not exist yet — show empty
          if (res.status === 400 || res.status === 404) {
            setRecords([]);
            return;
          }
          throw new Error(`Failed to fetch records: ${res.statusText}`);
        }
        const data = await res.json();
        setRecords(data.records ?? []);
      } catch (err) {
        console.error("Failed to fetch claim records:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [did]);

  // Helper to extract a display-friendly rkey from the URI
  const getRkey = (uri: string) => uri.split("/").pop() ?? "";

  // Helper to format a value for display — show key fields if they exist
  const formatRecordSummary = (value: Record<string, unknown>): string => {
    // Try common fields that might exist on claim activity records
    if (typeof value.title === "string") return value.title;
    if (typeof value.name === "string") return value.name;
    if (typeof value.description === "string") return value.description.slice(0, 120) + (value.description.length > 120 ? "…" : "");
    if (typeof value.$type === "string") return value.$type;
    return "Claim record";
  };

  // Helper to get a timestamp if available
  const getTimestamp = (value: Record<string, unknown>): string | null => {
    if (typeof value.createdAt === "string") return value.createdAt;
    if (typeof value.indexedAt === "string") return value.indexedAt;
    return null;
  };

  // Format date for display
  const formatDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <AuthGuard>
      <div className="dashboard">
        <div className="dashboard__topbar">
          <h1 className="dashboard__page-title">My Data</h1>
        </div>

        <div className="dashboard__body dashboard__body--single">
          <div className="dashboard__main">
            {/* Info card */}
            <div className="dash-card">
              <h2 className="dash-card__title">Hypercerts Claims</h2>
              <p className="dash-card__desc">
                These are your claim activity records stored on your Personal Data Server (PDS). They represent contributions and impact claims tracked through the Hypercerts protocol.
              </p>
            </div>

            {/* Records list */}
            <div className="dash-card mt-4">
              {loading ? (
                <div className="my-data__loading">
                  <LoadingSpinner size="md" />
                </div>
              ) : error ? (
                <div className="my-data__error">
                  <p className="my-data__error-text">{error}</p>
                </div>
              ) : records.length === 0 ? (
                <div className="my-data__empty">
                  <div className="my-data__empty-icon">📋</div>
                  <h3 className="my-data__empty-title">No claims yet</h3>
                  <p className="my-data__empty-desc">
                    When you create or receive hypercerts claims, they will appear here. Your data is stored on your Personal Data Server and travels with your identity.
                  </p>
                </div>
              ) : (
                <div className="my-data__list">
                  <div className="my-data__list-header">
                    <span className="my-data__list-count">{records.length} record{records.length !== 1 ? "s" : ""}</span>
                  </div>
                  {records.map((record) => {
                    const rkey = getRkey(record.uri);
                    const summary = formatRecordSummary(record.value);
                    const timestamp = getTimestamp(record.value);
                    return (
                      <div key={record.uri} className="my-data__record">
                        <div className="my-data__record-main">
                          <p className="my-data__record-title">{summary}</p>
                          <p className="my-data__record-rkey">{rkey}</p>
                        </div>
                        <div className="my-data__record-meta">
                          {timestamp && (
                            <span className="my-data__record-date">{formatDate(timestamp)}</span>
                          )}
                          <span className="my-data__record-cid" title={record.cid}>
                            {record.cid.slice(0, 12)}…
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Raw data info */}
            <div className="dash-card mt-4">
              <h2 className="dash-card__title">About Your Data</h2>
              <p className="dash-card__desc">
                All your data is stored on your Personal Data Server (PDS) under the collection <code className="my-data__code">{COLLECTION}</code>. Because your data lives on the AT Protocol, it is portable — you can move it to any compatible server at any time.
              </p>
              {did && (
                <div className="my-data__did-info">
                  <span className="my-data__did-label">Your DID</span>
                  <span className="my-data__did-value">{did}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
