"use client"

import { useState } from "react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useCertContext } from "@/hooks/use-cert-context"
import ActivityFeedView from "@/components/explore/views/activity-feed-view"
import FacetedSidebarView from "@/components/explore/views/faceted-sidebar-view"
import AccordionView from "@/components/explore/views/accordion-view"
import TagIntersectionView from "@/components/explore/views/tag-intersection-view"
import FileTreeView from "@/components/explore/views/file-tree-view"
import HybridView from "@/components/explore/views/hybrid-view"

interface CertExploreProps {
  /** at:// URI of the cert or project being explored. */
  subjectUri: string
  /** Human-readable headline rendered at the top of the page. */
  subjectTitle?: string
  /** Short subject kind label ("Cert" / "Project") — for breadcrumb / header. */
  subjectKind?: string
}

const VIEWS = [
  { key: "hybrid", label: "Hybrid (recommended)" },
  { key: "feed", label: "Activity feed" },
  { key: "faceted", label: "Faceted sidebar" },
  { key: "accordion", label: "Accordion" },
  { key: "tags", label: "Tag intersection" },
  { key: "tree", label: "File tree" },
] as const

type ViewKey = (typeof VIEWS)[number]["key"]

/**
 * Universal "what's attached to this cert / project" explorer.
 *
 * Aggregates every related record across the supported lexicons and
 * lets the user compare six different navigation patterns over the
 * same data. Used to evaluate layout candidates before we commit to
 * one for the detail pages.
 */
export default function CertExplore({
  subjectUri,
  subjectTitle,
  subjectKind = "Subject",
}: CertExploreProps) {
  const { items, isLoading, error } = useCertContext(subjectUri)
  const [view, setView] = useState<ViewKey>("hybrid")

  return (
    <div className="cert-explore">
      <header className="cert-explore__head">
        <span className="cert-explore__eyebrow">{subjectKind} · context</span>
        <h1 className="cert-explore__title">
          {subjectTitle ?? "Exploring related records"}
        </h1>
        <p className="cert-explore__subtitle">
          {items.length === 0 && !isLoading
            ? "No related records pointed at this subject yet."
            : `${items.length} related record${items.length === 1 ? "" : "s"} across ${countLexicons(items)} lexicon${countLexicons(items) === 1 ? "" : "s"}.`}
        </p>
      </header>

      <nav
        className="cert-explore__tabs"
        role="tablist"
        aria-label="Navigation patterns"
      >
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            className={`cert-explore__tab${view === v.key ? " cert-explore__tab--active" : ""}`}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <div className="cert-explore__body">
        {isLoading && items.length === 0 ? (
          <div className="cert-explore__loading">
            <LoadingSpinner size="md" />
          </div>
        ) : error ? (
          <p className="ctx-empty">Couldn&apos;t load context: {error}</p>
        ) : items.length === 0 ? (
          <p className="ctx-empty">
            No attachments, evaluations, measurements, or collections reference
            this {subjectKind.toLowerCase()} yet.
          </p>
        ) : view === "hybrid" ? (
          <HybridView items={items} />
        ) : view === "feed" ? (
          <ActivityFeedView items={items} />
        ) : view === "faceted" ? (
          <FacetedSidebarView items={items} />
        ) : view === "accordion" ? (
          <AccordionView items={items} />
        ) : view === "tags" ? (
          <TagIntersectionView items={items} />
        ) : (
          <FileTreeView items={items} />
        )}
      </div>
    </div>
  )
}

function countLexicons(items: { lexicon: string }[]): number {
  return new Set(items.map((i) => i.lexicon)).size
}
