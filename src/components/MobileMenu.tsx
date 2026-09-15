import { createContext, useContext, useState, type ReactNode } from "react";

interface MobileMenuContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const MobileMenuContext = createContext<MobileMenuContextValue | null>(null);

export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <MobileMenuContext.Provider value={{ open, setOpen }}>{children}</MobileMenuContext.Provider>;
}

export function useMobileMenu() {
  const ctx = useContext(MobileMenuContext);
  if (!ctx) throw new Error("useMobileMenu must be used within MobileMenuProvider");
  return ctx;
}
