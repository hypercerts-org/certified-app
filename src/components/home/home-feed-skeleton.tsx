import Skeleton from "@/components/ui/skeleton"

const SKELETON_CARDS = 3

/**
 * Initial-load placeholder for the home feed: a few cards laid out
 * exactly like `.home-feed__card` (32px avatar + byline / sentence
 * lines, then the indented square image and title), so the real
 * feed replaces it without a layout jump. Reuses the feed's own
 * classes for spacing and dividers; the bars come from <Skeleton>,
 * which delays its fade-in so fast loads never flash it.
 */
export default function HomeFeedSkeleton() {
  return (
    <ol className="home-feed" aria-busy="true" aria-label="Loading feed">
      {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
        <li key={i} className="home-feed__item" aria-hidden>
          <div className="home-feed__card">
            <div className="home-feed__card-head">
              <Skeleton circle width={32} height={32} />
              <div className="home-feed__card-head-meta gap-1.5">
                <Skeleton variant="line" width="40%" height={14} />
                <Skeleton variant="line" width="65%" height={12} />
              </div>
            </div>
            <div className="home-feed__card-body">
              {/* Same box as .home-feed__card-image: square, capped
                  at 400px on desktop. */}
              <Skeleton
                variant="box"
                width="min(100%, 400px)"
                style={{ height: "auto", aspectRatio: "1 / 1" }}
              />
              <Skeleton variant="line" width="70%" height={20} />
              <Skeleton variant="line" width="90%" height={14} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
