"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useOrg } from "@/lib/groups/org-context";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth/fetch";
import EmptyState from "@/components/ui/empty-state";
import { PenLine, Building2 } from "lucide-react";

// `at://<did>/<collection>/<rkey>` — capture all three so we don't
// rely on the response's `did` matching the auth-context `did` and so
// a malformed uri can't redirect us to `/activity//<...>`.
const AT_URI_RE = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/;

export default function CreatePage() {
  const { isAuthenticated, did } = useAuth();
  const { activeOrg } = useOrg();
  const router = useRouter();
  // Track whether the user navigated to /create from inside the app.
  // window.history.length is unreliable cross-browser, but
  // `document.referrer` is set when the previous page was on our
  // origin and empty on direct loads / external links. Computed once
  // via useState's lazy initializer so the value is read at mount and
  // stays stable for the lifetime of the page (no render-time ref
  // writes, which React 19 disallows).
  const [arrivedFromInApp] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      return !!referrer && referrer.origin === window.location.origin;
    } catch {
      return false;
    }
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={PenLine}
              title="Sign in to create"
              description="You need to be signed in to create an activity claim."
            />
          </div>
        </div>
      </div>
    );
  }

  // The xrpc proxy validates repo === session DID for write methods, so
  // when acting as a group we can't write through this path. Rather than
  // silently writing to the personal repo, surface the constraint.
  if (activeOrg) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={Building2}
              title="Switch to your personal account"
              description="Creating activity claims as a group isn't supported yet. Use the account switcher to switch to your personal identity."
            />
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !did) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: did,
          collection: "org.hypercerts.claim.activity",
          record: {
            $type: "org.hypercerts.claim.activity",
            title: title.trim(),
            shortDescription: description.trim(),
            createdAt: new Date().toISOString(),
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed: ${res.status}`);
      }

      // Land on the new claim's detail page so the user sees what they
      // just published, rather than back on a generic feed. Use the DID
      // and rkey from the response uri (not the auth-context did) so a
      // future cross-repo write path stays correct.
      const uri: unknown = data?.uri;
      const match = typeof uri === "string" ? AT_URI_RE.exec(uri) : null;
      if (match) {
        const [, ownerDid, , rkey] = match;
        router.push(`/activity/${encodeURIComponent(ownerDid)}/${encodeURIComponent(rkey)}`);
      } else {
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Create Cert</h1>
      </div>
      <div className="dashboard__body">
        <div className="dashboard__main">
          <form className="create-form" onSubmit={handleSubmit}>
            <div className="create-form__field">
              <label className="create-form__label" htmlFor="title">Title</label>
              <input
                id="title"
                className="create-form__input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What impact work did you do?"
                maxLength={256}
                required
              />
            </div>

            <div className="create-form__field">
              <label className="create-form__label" htmlFor="description">Description</label>
              <textarea
                id="description"
                className="create-form__textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the activity..."
                maxLength={3000}
                rows={4}
                required
              />
            </div>

            {error && <p className="create-form__error">{error}</p>}

            <div className="create-form__actions">
              <button
                type="button"
                className="create-form__cancel"
                onClick={() => {
                  // router.back() can kick the user to an external site
                  // when they landed on /create from an email link or
                  // direct URL — fall back to "/" in that case so
                  // Cancel always stays in-app.
                  if (arrivedFromInApp) {
                    router.back();
                  } else {
                    router.push("/");
                  }
                }}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="create-form__submit"
                disabled={isSubmitting || !title.trim() || !description.trim()}
              >
                {isSubmitting ? "Publishing..." : "Publish"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
