"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Menu } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading || !isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      {/* Mobile header — visible only on small screens */}
      <div className="mobile-header">
        <a href="/" className="mobile-header__logo">
          <img src="/assets/certified_wordmark_darkblue.svg" alt="Certified" />
        </a>
        <button
          className="mobile-header__toggle"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-shell__content">
        {children}
      </div>
    </div>
  );
}
