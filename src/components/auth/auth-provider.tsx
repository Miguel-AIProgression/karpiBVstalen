"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
// Reuse-first (I4): dit is dezelfde rol-enum als de server-side rol-gate
// (requireRole) gebruikt — geen tweede UserRole-definitie die uit de pas kan
// lopen. Type-only import: geen runtime-afhankelijkheid van next/server in de
// clientbundel.
import type { AppRole } from "@/lib/auth/require-role";

interface AuthContext {
  user: User | null;
  /** null = geen (herkende) rol in app_metadata — UI-gates behandelen dit als "geen rechten", niet als "sales". */
  role: AppRole | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  role: null,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        setRole(
          (currentUser?.app_metadata?.role as AppRole | undefined) ?? null
        );
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
