"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { Menu } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Escape key closes the sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  // Body scroll lock when sidebar is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  // Focus management: move focus into sidebar close button when open,
  // return focus to hamburger button when closed
  useEffect(() => {
    if (sidebarOpen) {
      // Query the close button rendered inside the Sidebar component
      const closeBtn = document.querySelector<HTMLElement>(".sidebar__close");
      closeBtn?.focus();
    } else {
      hamburgerRef.current?.focus();
    }
  }, [sidebarOpen]);

  // App pages always show the shell (even while loading)
  // so the user sees the sidebar + a spinner instead of the landing logo
  const isAppPage = pathname.startsWith("/settings") || pathname.startsWith("/connected-apps");
  const showShell = isAppPage || (!isLoading && isAuthenticated);

  if (!showShell) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      {/* Mobile header — visible only on small screens */}
      <div className="mobile-header">
        <Link href="/" className="mobile-header__logo">
          <img src="/assets/certified_wordmark_darkblue.svg" alt="Certified" />
        </Link>
        <button
          ref={hamburgerRef}
          className="mobile-header__toggle"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Overlay — decorative; Escape key and close button handle keyboard access */}
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
