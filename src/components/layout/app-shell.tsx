"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

  // App pages always show the shell (even while loading)
  const isAppPage = pathname.startsWith("/settings") || pathname.startsWith("/connected-apps");
  const showShell = isAppPage || (!isLoading && isAuthenticated);

  if (!showShell) {
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
