"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import LoadingSpinner from "@/components/ui/loading-spinner";

export interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children, fallback }) => {
  const router = useRouter();
  const { isLoading, session } = useAuth();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, session, router]);

  // Show loading fallback while checking auth
  if (isLoading) {
    return (
      <div
        className="min-h-[50vh] flex items-center justify-center"
        aria-busy="true"
      >
        {fallback || <LoadingSpinner size="md" />}
      </div>
    );
  }

  // Don't render children if not authenticated (will redirect)
  if (!session) {
    return null;
  }

  // Render children when authenticated
  return <>{children}</>;
};

export default AuthGuard;
