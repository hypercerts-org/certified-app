"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type NavbarVariant = "default" | "transparent";

interface NavbarContextValue {
  variant: NavbarVariant;
  setVariant: (v: NavbarVariant) => void;
}

const NavbarContext = createContext<NavbarContextValue>({
  variant: "default",
  setVariant: () => {},
});

export function NavbarProvider({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState<NavbarVariant>("default");
  return (
    <NavbarContext.Provider value={{ variant, setVariant }}>
      {children}
    </NavbarContext.Provider>
  );
}

export function useNavbarVariant() {
  return useContext(NavbarContext);
}
