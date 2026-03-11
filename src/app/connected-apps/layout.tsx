"use client";

import React from "react";
import AuthGuard from "@/components/layout/auth-guard";

export default function ConnectedAppsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
