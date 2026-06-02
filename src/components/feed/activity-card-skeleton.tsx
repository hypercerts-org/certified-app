import Skeleton from "@/components/ui/skeleton"

export default function ActivityCardSkeleton() {
  return (
    <div className="feed-skeleton" aria-busy="true">
      <Skeleton
        variant="box"
        width="100%"
        className="mb-3"
        style={{ height: "auto", aspectRatio: "1 / 1" }}
      />
      <Skeleton variant="line" width="70%" height={20} className="mb-2" />
      <Skeleton variant="line" height={14} className="mb-1.5" />
      <Skeleton variant="line" width="45%" height={14} />
      <div className="feed-skeleton__meta">
        <Skeleton variant="line" width={72} height={18} radius={999} />
        <Skeleton variant="line" width={72} height={18} radius={999} />
      </div>
    </div>
  )
}
