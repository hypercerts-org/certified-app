"use client";

import React from "react";
import AuthGuard from "@/components/layout/auth-guard";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
