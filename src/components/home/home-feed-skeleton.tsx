import Skeleton from "@/components/ui/skeleton"

const SKELETON_CARDS = 3

/**
 * Initial-load placeholder for the feed: a few cards laid out exactly
 * like `.home-feed__card` (32px avatar, the byline and verb-sentence
 * lines, then the indented square image, title and description), so the
 * real feed replaces it without a layout jump. Reuses the feed's own
 * classes for spacing and dividers; the bars come from <Skeleton>, which
 * delays its fade-in so fast loads never flash it.
 */
export default function HomeFeedSkeleton() {
  return (
    <ol className="home-feed" aria-busy="true" aria-label="Loading feed">
      {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
        <li key={i} className="home-feed__item" aria-hidden>
          <div className="home-feed__card">
            <div className="home-feed__card-head">
              <Skeleton circle width={32} height={32} />
              <div className="home-feed__card-head-meta home-feed__card-head-meta--skeleton">
                <Skeleton variant="line" width="45%" height={14} />
                <Skeleton variant="line" width="70%" height={12} />
              </div>
            </div>
            <div className="home-feed__card-body">
              {/* Same box as .home-feed__card-image: square, the full
                  width of the text column. */}
              <div className="home-feed__card-image">
                <Skeleton variant="box" height="100%" />
              </div>
              <Skeleton variant="line" width="70%" height={20} />
              <Skeleton variant="line" width="90%" height={14} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
