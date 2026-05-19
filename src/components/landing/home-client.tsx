"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import ActivityFeed from "@/components/feed/activity-feed";
import Brandmark from "@/components/ui/brandmark";
import { useActiveEvaluators } from "@/hooks/use-active-evaluators";
import { useAuthorInfo } from "@/hooks/use-author-info";
import { TRUSTED_EVALUATORS } from "@/config/trusted-evaluators";

type FeedTab = "for-you" | "following"

const SHOW_EVERYTHING_KEY = "feed.showEverything"

function readShowEverything(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(SHOW_EVERYTHING_KEY) === "true"
}

export default function HomeClient() {
  const { isLoading, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<FeedTab>("for-you");
  const [filterOpen, setFilterOpen] = useState(false);
  const tabRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Show everything state
  const [showEverything, setShowEverythingRaw] = useState(readShowEverything);

  const evaluators = useActiveEvaluators();

  const setShowEverything = useCallback((value: boolean) => {
    setShowEverythingRaw(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHOW_EVERYTHING_KEY, String(value));
    }
  }, []);

  // Reset to "for-you" if user signs out while on "following" tab
  useEffect(() => {
    if (!isAuthenticated && activeTab === "following") {
      setActiveTab("for-you");
    }
  }, [isAuthenticated, activeTab]);

  const isDefaultFilter = !showEverything &&
    evaluators.active.size === TRUSTED_EVALUATORS.length &&
    TRUSTED_EVALUATORS.every(d => evaluators.active.has(d));

  const handleForYouClick = () => {
    if (activeTab === "for-you") {
      setFilterOpen(prev => !prev);
    } else {
      setActiveTab("for-you");
      setFilterOpen(false);
    }
  };

  // Close filter on outside click
  useEffect(() => {
    if (!filterOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTab = tabRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideTab && !insidePanel) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen]);

  // Close filter on Escape so keyboard users can dismiss it without
  // having to tab out to a non-focusable region.
  useEffect(() => {
    if (!filterOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFilterOpen(false);
        // Return focus to the trigger so screen readers announce the
        // collapse and keyboard nav resumes where the user expects.
        document.getElementById("tab-for-you")?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [filterOpen]);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__inner">
          <Brandmark
            title=""
            aria-hidden="true"
            className="loading-screen__logo"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div
        className="feed-tabs"
        role="tablist"
        aria-label="Feed"
        onKeyDown={(e) => {
          if (!isAuthenticated) return
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault()
            const next = activeTab === "for-you" ? "following" : "for-you"
            setActiveTab(next)
            setFilterOpen(false)
            const el = document.getElementById(`tab-${next}`) as HTMLButtonElement | null
            el?.focus()
          }
        }}
      >
        <div className="feed-tabs__tab-wrapper" ref={tabRef}>
          <button
            className={`feed-tabs__tab ${activeTab === "for-you" ? "feed-tabs__tab--active" : ""}`}
            role="tab"
            id="tab-for-you"
            tabIndex={activeTab === "for-you" ? 0 : -1}
            aria-selected={activeTab === "for-you"}
            // Only set aria-controls when the tab is active — the
            // tabpanel is only mounted for the active tab, so dangling
            // refs would point at non-existent ids.
            aria-controls={activeTab === "for-you" ? "tabpanel-for-you" : undefined}
            // When this tab is already active, clicking it toggles a
            // filter disclosure. Surface that to assistive tech so a
            // screen-reader user knows what the second activation does.
            aria-haspopup={activeTab === "for-you" ? "dialog" : undefined}
            aria-expanded={activeTab === "for-you" ? filterOpen : undefined}
            onClick={handleForYouClick}
          >
            {isDefaultFilter ? "For you" : "Custom"}
            {activeTab === "for-you" && (
              <ChevronDown
                size={14}
                className={`feed-tabs__chevron ${filterOpen ? "feed-tabs__chevron--open" : ""}`}
              />
            )}
          </button>
        </div>

        {isAuthenticated && (
          <button
            className={`feed-tabs__tab ${activeTab === "following" ? "feed-tabs__tab--active" : ""}`}
            role="tab"
            id="tab-following"
            tabIndex={activeTab === "following" ? 0 : -1}
            aria-selected={activeTab === "following"}
            aria-controls={activeTab === "following" ? "tabpanel-following" : undefined}
            onClick={() => { setActiveTab("following"); setFilterOpen(false); }}
          >
            Following
          </button>
        )}
      </div>

      {filterOpen && (
        <div
          className="feed-evaluator-panel"
          ref={panelRef}
          role="region"
          aria-label="Filter trusted evaluators"
        >
          {TRUSTED_EVALUATORS.map((did) => (
            <EvaluatorCheckbox
              key={did}
              did={did}
              checked={evaluators.active.has(did)}
              disabled={showEverything}
              onToggle={evaluators.toggle}
            />
          ))}
          <div className="feed-evaluators__separator" />
          <label className="feed-evaluators__show-all">
            <input
              type="checkbox"
              checked={showEverything}
              onChange={(e) => setShowEverything(e.target.checked)}
              className="feed-evaluators__checkbox"
            />
            <span className="feed-evaluators__show-all-label">Show everything</span>
          </label>
        </div>
      )}

      {/* Warning banner when showing everything */}
      {activeTab === "for-you" && showEverything && (
        <div className="feed-unfiltered-banner" role="status">
          Caution: You are viewing all activities, unfiltered
        </div>
      )}

      <div className="dashboard__body">
        <div className="dashboard__main" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
          <ActivityFeed
            mode={activeTab}
            showEverything={showEverything}
            activeEvaluatorList={evaluators.activeList}
            evaluatorStableKey={evaluators.stableKey}
          />
        </div>
      </div>
    </div>
  );
}

function EvaluatorCheckbox({
  did,
  checked,
  disabled,
  onToggle,
}: {
  did: string
  checked: boolean
  disabled: boolean
  onToggle: (did: string) => void
}) {
  const { info } = useAuthorInfo(did);
  const handleChange = useCallback(() => onToggle(did), [did, onToggle]);

  const displayName = info?.displayName || truncateDid(did);
  const handle = info?.handle;
  const avatarUrl = info?.avatarUrl;

  return (
    <label className={`feed-evaluators__row ${disabled ? "feed-evaluators__row--disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        className="feed-evaluators__checkbox"
      />
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          className="feed-evaluators__avatar"
          width={24}
          height={24}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          // unoptimized: avatarUrl comes from a foreign blob source
          // (Bluesky CDN / foreign PDS) not covered by
          // next.config.ts remotePatterns.
          unoptimized
        />
      ) : (
        <span className="feed-evaluators__avatar feed-evaluators__avatar--placeholder" />
      )}
      <span className="feed-evaluators__name">{displayName}</span>
      {handle && (
        <span className="feed-evaluators__handle">@{handle}</span>
      )}
    </label>
  );
}

function truncateDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 16)}...${did.slice(-6)}`;
}
