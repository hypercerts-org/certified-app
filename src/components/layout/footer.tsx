"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Footer: React.FC = () => {
  const pathname = usePathname();

  // Hide footer on landing page (has its own footer) and why-certified (dark bg has own footer)
  if (pathname === "/") return null;

  const isDark = pathname === "/why-certified";

  return (
    <footer className={`footer ${isDark ? "footer--dark" : ""}`}>
      <div className="footer__inner">
        <p className="footer__copy">
          &copy; 2026 Certified. All rights reserved.
        </p>
        <div className="footer__links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Policy</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
