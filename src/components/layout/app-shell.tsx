"use client";

import { useAuth } from "@/lib/auth/auth-context";
import Sidebar from "@/components/layout/sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || !isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__content">
        {children}
      </div>
    </div>
  );
}
