"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";

export default function Home() {
  const { session, did, signIn } = useAuth();

  if (session) {
    // Authenticated state
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8 bg-gray-50 min-h-screen">
        <h2 className="text-h2 text-navy mb-6">Welcome back</h2>
        <Card className="mb-6">
          <p className="text-body text-gray-700 mb-4">
            You are signed in with:
          </p>
          <p className="text-body-sm text-gray-400 font-mono break-all">
            {did}
          </p>
        </Card>
        <Link
          href="/profile"
          className="text-body text-accent hover:underline inline-block"
        >
          View your profile →
        </Link>
      </div>
    );
  }

  // Not authenticated - Hero section
  return (
    <>
      {/* Hero section - full width, breaks out of container */}
      <div className="relative -mx-6 -mt-8">
        <section className="w-full bg-navy py-16 lg:py-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="max-w-3xl">
              <h1
                className="text-display text-white animate-fade-up"
                style={{
                  fontSize: "3rem",
                  fontWeight: 700,
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                }}
              >
                Your identity, everywhere.
              </h1>
              <p
                className="text-h4 text-sky font-normal mt-4 max-w-2xl animate-fade-up"
                style={{ animationDelay: "100ms" }}
              >
                Sign in once. Your contributions, reputation, and impact follow
                you across the ecosystem.
              </p>
              <div
                className="mt-8 animate-fade-up"
                style={{ animationDelay: "200ms" }}
              >
                <Button variant="primary" onClick={signIn}>
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Add animation styles */}
      <style jsx>{`
        @keyframes fade-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-up {
          animation: fade-up 0.6s ease-out forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-up {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </>
  );
}
