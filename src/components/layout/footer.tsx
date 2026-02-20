"use client";

import React from "react";
import { CheckCircle } from "lucide-react";

const Footer: React.FC = () => {
  return (
    <footer className="bg-navy text-white py-12">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Top row */}
        <div className="flex justify-between items-start">
          {/* Left: Certified wordmark */}
          <div className="flex items-center gap-2">
            <img
              src="/assets/certified_wordmark_white.svg"
              alt="Certified"
              className="h-6"
              onError={(e) => {
                // Fallback to text + icon if SVG doesn't exist
                e.currentTarget.style.display = "none";
                const fallback = e.currentTarget.nextElementSibling;
                if (fallback) {
                  (fallback as HTMLElement).style.display = "flex";
                }
              }}
            />
            <span
              className="text-h4 text-white font-semibold hidden items-center gap-2"
              style={{ display: "none" }}
            >
              <CheckCircle className="h-6 w-6 text-white" />
              Certified
            </span>
          </div>

          {/* Right: Links */}
          <div className="flex gap-6">
            <a
              href="#"
              className="text-body-sm text-sky hover:text-white transition-colors duration-200"
            >
              About
            </a>
            <a
              href="https://hypercerts-v02-documentation.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-body-sm text-sky hover:text-white transition-colors duration-200"
            >
              Documentation
            </a>
            <a
              href="#"
              className="text-body-sm text-sky hover:text-white transition-colors duration-200"
            >
              GitHub
            </a>
          </div>
        </div>

        {/* Bottom row */}
        <div className="mt-8 border-t border-deep pt-8 flex justify-between items-center">
          <p className="text-caption text-gray-400">
            © 2026 Certified. All rights reserved.
          </p>
          <div>{/* Empty for now */}</div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
