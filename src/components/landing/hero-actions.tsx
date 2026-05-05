"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * Hero CTA pair — primary "Create your account" (black, with arrow) and
 * secondary "Explore apps" (outlined, with arrow). Mirrors the editorial
 * layout in the reference with a quiet hairline border between them.
 */
export default function HeroActions() {
  const { openSignIn } = useAuth();

  return (
    <div className="hero__actions">
      <button
        type="button"
        className="btn btn--primary"
        onClick={openSignIn}
      >
        Create your account
        <ArrowRight size={18} strokeWidth={1.75} className="btn__arrow" />
      </button>
      <Link href="#partner-apps" className="btn btn--secondary">
        Explore apps
        <ArrowRight size={18} strokeWidth={1.75} className="btn__arrow" />
      </Link>
    </div>
  );
}
