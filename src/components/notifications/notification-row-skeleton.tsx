"use client"

export default function NotificationRowSkeleton() {
  return (
    <div className="notification-row notification-row--skeleton" aria-hidden="true">
      <div className="notification-row__avatar-skel" />
      <div className="notification-row__body">
        <div className="notification-row__text-skel" />
        <div className="notification-row__time-skel" />
      </div>
    </div>
  )
}
