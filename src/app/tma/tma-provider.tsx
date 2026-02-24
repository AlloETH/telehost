"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { BottomNav } from "@/components/tma/bottom-nav";

interface TMAContextValue {
  isReady: boolean;
  userId: string | null;
  walletAddress: string | null;
  telegramUser: {
    id: number;
    firstName: string;
    lastName?: string;
    username?: string;
    isPremium?: boolean;
    photoUrl?: string;
  } | null;
}

const TMAContext = createContext<TMAContextValue>({
  isReady: false,
  userId: null,
  walletAddress: null,
  telegramUser: null,
});

export function useTMA() {
  return useContext(TMAContext);
}

export function TMAProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TMAContextValue>({
    isReady: false,
    userId: null,
    walletAddress: null,
    telegramUser: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;

    if (!webApp) {
      setError("Not running inside Telegram");
      setLoading(false);
      return;
    }

    // Expand to full height and signal ready
    webApp.expand();
    webApp.ready();

    // Apply Telegram theme colors as CSS variables
    const tp = webApp.themeParams;
    const root = document.documentElement;
    if (tp.bg_color) root.style.setProperty("--background", tp.bg_color);
    if (tp.text_color) root.style.setProperty("--foreground", tp.text_color);
    if (tp.secondary_bg_color) root.style.setProperty("--card", tp.secondary_bg_color);
    if (tp.hint_color) root.style.setProperty("--muted-foreground", tp.hint_color);
    if (tp.button_color) root.style.setProperty("--primary", tp.button_color);
    if (tp.link_color) root.style.setProperty("--ring", tp.link_color);
    if (tp.section_separator_color) root.style.setProperty("--border", tp.section_separator_color);

    // Validate initData
    const initData = webApp.initData;
    if (!initData) {
      setError("No initData available");
      setLoading(false);
      return;
    }

    fetch("/api/auth/tma/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (res.ok && data.success) {
          setState({
            isReady: true,
            userId: data.userId,
            walletAddress: data.walletAddress,
            telegramUser: data.telegramUser,
          });
        } else {
          setError(data.error || `Authentication failed (${res.status})`);
        }
      })
      .catch((err) => {
        setError(err.message || "Network error");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const manifestUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/tonconnect-manifest.json`
      : "";

  const twaReturnUrl = process.env.NEXT_PUBLIC_TMA_RETURN_URL || undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--muted-foreground)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-6" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center max-w-sm w-full">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 mb-4">
            <span className="text-xl">!</span>
          </div>
          <p className="text-lg font-semibold mb-2">Unable to load</p>
          <p className="text-sm text-[var(--muted-foreground)]">{error}</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-4">
            Please open this app from Telegram.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TMAContext.Provider value={state}>
      <TonConnectUIProvider
        manifestUrl={manifestUrl}
        actionsConfiguration={{ twaReturnUrl: twaReturnUrl as `${string}://${string}` }}
      >
        <div className="tma-root min-h-screen" style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}>
          {children}
        </div>
        <BottomNav />
      </TonConnectUIProvider>
    </TMAContext.Provider>
  );
}
