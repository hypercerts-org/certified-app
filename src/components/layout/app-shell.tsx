"use client";

import { usePathname } from "next/navigation";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Landing page doesn't use the app shell
  if (pathname === "/welcome") {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <div className="app-shell__content">
        {children}
      </div>
    </div>
  );
}
