"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import PeopleSearch from "@/components/search/people-search"

/**
 * Explore page — atproto people search.
 *
 * Per current product direction the page searches *people* only (not
 * activities). Selecting a result navigates to that person's profile.
 *
 * The previous activity-search UI is removed; if/when activity search
 * returns it will live behind its own tab or route.
 */
function SearchPageInner() {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q") ?? ""

  return (
    <div className="dashboard">
      <div className="search-page">
        <PeopleSearch
          className="people-search--page"
          placeholder="Search people on atproto"
          initialQuery={initialQuery}
          autoFocus
        />
        {initialQuery.trim().length === 0 && (
          <p className="search-page__hint">
            Search by handle or display name. Click a result to open their profile.
          </p>
        )}
      </div>
    </div>
  )
}

export default function SearchPage() {
  // useSearchParams() requires a Suspense boundary during static prerender;
  // without it the build bails with "useSearchParams() should be wrapped in
  // a suspense boundary" (Next.js 16 / Turbopack).
  return (
    <Suspense fallback={<div className="dashboard"><div className="search-page" /></div>}>
      <SearchPageInner />
    </Suspense>
  )
}
