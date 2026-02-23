"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface AuthState {
  authenticated: boolean;
  userId: string;
  walletAddress: string;
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Not authenticated");
      })
      .then(setAuth)
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!auth?.authenticated) return null;

  return <>{children}</>;
}
