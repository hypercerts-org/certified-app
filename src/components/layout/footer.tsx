"use client";

import React from "react";
import Link from "next/link";

const Footer: React.FC = () => {
  return (
    <footer className="py-8">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <p className="text-caption text-gray-400">
            © 2026 Certified. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/terms" className="text-caption text-gray-400 hover:text-gray-600 transition-colors duration-200">
              Terms
            </Link>
            <Link href="/privacy" className="text-caption text-gray-400 hover:text-gray-600 transition-colors duration-200">
              Policy
            </Link>
            <a
              href="https://hypercerts-v02-documentation.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-caption text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              Documentation
            </a>
            <a
              href="#"
              className="text-caption text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
