"use client"

import React from "react"
import { useBskyPosts, type BskyPost } from "@/hooks/use-bsky-posts"
import { formatRelativeTime } from "@/lib/atproto/activity"
import RichText from "./rich-text"

const HANDLE = "certified.app"

/**
 * Right-rail "News" section: shows the latest public Bluesky post from
 * @certified.app, with a "More" button that pages three older posts at
 * a time. The button hides itself once the timeline is exhausted (see
 * `useBskyPosts.hasMore`).
 */
export default function NewsSection() {
  const { posts, hasMore, isLoading, isLoadingMore, error, loadMore } =
    useBskyPosts(HANDLE)

  return (
    <section className="right-rail__section" aria-labelledby="rr-news">
      <h2 id="rr-news" className="right-rail__heading">
        News
      </h2>

      {isLoading && posts.length === 0 ? (
        <p className="right-rail__empty">Loading…</p>
      ) : error && posts.length === 0 ? (
        <p className="right-rail__empty">Couldn&apos;t load posts.</p>
      ) : posts.length === 0 ? (
        <p className="right-rail__empty">No posts yet.</p>
      ) : (
        <>
          <ul className="news__list">
            {posts.map((post) => (
              <li key={post.uri} className="news__item">
                <NewsPost post={post} />
              </li>
            ))}
          </ul>
          {hasMore ? (
            <button
              type="button"
              className="news__more"
              onClick={loadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading…" : "More"}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}

function NewsPost({ post }: { post: BskyPost }) {
  // The AT-URI ends in the rkey: at://<did>/app.bsky.feed.post/<rkey>.
  // Bluesky's public web link is /profile/<handle>/post/<rkey>.
  const rkey = post.uri.split("/").pop() ?? ""
  const permalink = rkey
    ? `https://bsky.app/profile/${encodeURIComponent(post.author.handle)}/post/${encodeURIComponent(rkey)}`
    : `https://bsky.app/profile/${encodeURIComponent(post.author.handle)}`

  // We don't wrap the whole card in an anchor anymore — that would
  // nest the facet links (URLs/mentions/tags rendered by RichText)
  // inside an outer <a>, which is invalid HTML and breaks click
  // routing. Instead the relative time is the explicit "view post"
  // affordance, Twitter-style.
  return (
    <article className="news__article">
      <p className="news__text">
        <RichText text={post.record.text} facets={post.record.facets} />
      </p>
      <a
        href={permalink}
        target="_blank"
        rel="noopener noreferrer"
        className="news__time-link"
      >
        <time dateTime={post.record.createdAt}>
          {formatRelativeTime(post.record.createdAt)}
        </time>
      </a>
    </article>
  )
}
