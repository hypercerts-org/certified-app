"use client";

import { useEffect } from "react";
import { useNavbarVariant } from "@/lib/navbar-context";

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setVariant } = useNavbarVariant();

  useEffect(() => {
    setVariant("transparent");
    return () => setVariant("default");
  }, [setVariant]);

  return <>{children}</>;
}
