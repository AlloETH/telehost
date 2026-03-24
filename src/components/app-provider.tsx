"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { TonConnectUIProvider } from "@tonconnect/ui-react";

interface AppContextValue {
  isReady: boolean;
  isTMA: boolean;
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

const AppContext = createContext<AppContextValue>({
  isReady: false,
  isTMA: false,
  userId: null,
  walletAddress: null,
  telegramUser: null,
});

export function useApp() {
  return useContext(AppContext);
}

/** Detect if running inside Telegram WebApp */
function detectTMA(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.Telegram?.WebApp?.initData;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppContextValue>({
    isReady: false,
    isTMA: false,
    userId: null,
    walletAddress: null,
    telegramUser: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const isTMA = detectTMA();

    if (isTMA) {
      // TMA flow: validate initData, get session cookie
      const webApp = window.Telegram!.WebApp;
      webApp.expand();
      webApp.ready();

      // Apply Telegram theme colors
      const tp = webApp.themeParams;
      const root = document.documentElement;
      if (tp.bg_color) root.style.setProperty("--background", tp.bg_color);
      if (tp.text_color) root.style.setProperty("--foreground", tp.text_color);
      if (tp.secondary_bg_color) root.style.setProperty("--card", tp.secondary_bg_color);
      if (tp.hint_color) root.style.setProperty("--muted-foreground", tp.hint_color);
      if (tp.button_color) root.style.setProperty("--primary", tp.button_color);
      if (tp.link_color) root.style.setProperty("--ring", tp.link_color);
      if (tp.section_separator_color) root.style.setProperty("--border", tp.section_separator_color);

      fetch("/api/auth/tma/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          if (res.ok && data.success) {
            setState({
              isReady: true,
              isTMA: true,
              userId: data.userId,
              walletAddress: data.walletAddress,
              telegramUser: data.telegramUser,
            });
          } else {
            setError(data.error || `Authentication failed (${res.status})`);
          }
        })
        .catch((err) => setError(err.message || "Network error"))
        .finally(() => setLoading(false));
    } else {
      // Desktop flow: check existing session cookie
      fetch("/api/auth/session")
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data.authenticated) {
              setState({
                isReady: true,
                isTMA: false,
                userId: data.userId,
                walletAddress: data.walletAddress,
                telegramUser: null,
              });
              return;
            }
          }
          // Not authenticated — redirect to landing
          window.location.href = "/";
        })
        .catch(() => {
          window.location.href = "/";
        })
        .finally(() => setLoading(false));
    }
  }, []);

  const manifestUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/tonconnect-manifest.json`
      : "";

  const twaReturnUrl = process.env.NEXT_PUBLIC_TMA_RETURN_URL || undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--muted-foreground)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center max-w-sm w-full">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 mb-4">
            <span className="text-xl">!</span>
          </div>
          <p className="text-lg font-semibold mb-2">Unable to load</p>
          <p className="text-sm text-[var(--muted-foreground)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={state}>
      <TonConnectUIProvider
        manifestUrl={manifestUrl}
        actionsConfiguration={{ twaReturnUrl: twaReturnUrl as `${string}://${string}` }}
      >
        {children}
      </TonConnectUIProvider>
    </AppContext.Provider>
  );
}
