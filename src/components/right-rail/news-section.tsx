"use client"

import React, { useId } from "react"
import { useBskyPosts, type BskyPost } from "@/hooks/use-bsky-posts"
import { formatRelativeTime } from "@/lib/atproto/activity"
import RichText from "./rich-text"

const DEFAULT_ACTOR = "certified.app"

interface NewsSectionProps {
  /** Bluesky actor identifier (handle OR did:plc) — passed straight
   *  to `app.bsky.feed.getAuthorFeed`. Defaults to the official
   *  @certified.app handle. */
  actor?: string
  /** Section heading. Defaults to "News". */
  heading?: string
}

/**
 * "News" section: shows the latest public Bluesky post from the
 * configured actor with a "More" button that pages three older posts
 * at a time. The button hides itself once the timeline is exhausted
 * (see `useBskyPosts.hasMore`).
 *
 * The actor can be a handle or a DID — Bluesky's appView accepts both.
 */
export default function NewsSection({
  actor = DEFAULT_ACTOR,
  heading = "News",
}: NewsSectionProps = {}) {
  const { posts, hasMore, isLoading, isLoadingMore, error, loadMore } =
    useBskyPosts(actor)
  const headingId = useId()

  return (
    <section className="right-rail__section" aria-labelledby={headingId}>
      <h2 id={headingId} className="right-rail__heading">
        {heading}
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
  const images = post.images
  const gridClass =
    images && images.length > 0
      ? `news__images news__images--n${Math.min(images.length, 4)}`
      : null

  return (
    <article className="news__article">
      <p className="news__text">
        <RichText text={post.record.text} facets={post.record.facets} />
      </p>
      {images && gridClass ? (
        <a
          href={permalink}
          target="_blank"
          rel="noopener noreferrer"
          className={gridClass}
          aria-label="View post on Bluesky"
        >
          {images.slice(0, 4).map((img, i) => {
            const ratio = img.aspectRatio
              ? `${img.aspectRatio.width} / ${img.aspectRatio.height}`
              : undefined
            return (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={i}
                src={img.thumb}
                alt={img.alt}
                loading="lazy"
                className="news__image"
                style={images.length === 1 && ratio ? { aspectRatio: ratio } : undefined}
              />
            )
          })}
        </a>
      ) : null}
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
