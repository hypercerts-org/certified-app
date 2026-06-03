"use client"

import Skeleton from "@/components/ui/skeleton"

export default function NotificationRowSkeleton() {
  return (
    <div className="notification-row notification-row--skeleton" aria-hidden="true">
      <Skeleton circle width={32} className="notification-row__avatar" />
      <div className="notification-row__body">
        <Skeleton variant="line" width="70%" height={18} />
        <Skeleton variant="line" width={40} height={12} />
      </div>
    </div>
  )
}
