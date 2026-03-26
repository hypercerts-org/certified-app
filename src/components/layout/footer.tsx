"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

const Footer: React.FC = () => {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  // Hide footer for authenticated users (sidebar layout replaces it)
  if (isAuthenticated) return null;

  // Hide footer on landing page (has its own footer)
  if (pathname === "/") return null;

  return (
    <footer className="landing-footer">
      <div className="landing-footer__bar">
        <div className="landing-footer__left">
          <img src="/assets/certified_wordmark_black_green.png" alt="Certified" className="landing-footer__logo-img" />
          <span className="landing-footer__copy">&copy; 2026 Hypercerts Foundation</span>
        </div>
        <div className="landing-footer__links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
