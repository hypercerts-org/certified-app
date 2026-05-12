export default function ActivityCardSkeleton() {
  return (
    <div className="feed-skeleton">
      <div className="feed-skeleton__image" />
      <div className="feed-skeleton__title" />
      <div className="feed-skeleton__line" />
      <div className="feed-skeleton__line feed-skeleton__line--short" />
      <div className="feed-skeleton__meta">
        <div className="feed-skeleton__pill" />
        <div className="feed-skeleton__pill" />
      </div>
    </div>
  )
}
