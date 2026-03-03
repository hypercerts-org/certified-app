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
    <footer className="footer">
      <div className="footer__inner">
        <p className="footer__copy">&copy; 2026 Certified. All rights reserved.</p>
        <div className="footer__links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Policy</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
