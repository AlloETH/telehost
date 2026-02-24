"use client";

import { useEffect, useCallback, useRef } from "react";

function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/**
 * Control Telegram's native MainButton (bottom action button).
 */
export function useTelegramMainButton(
  text: string,
  onClick: () => void,
  options?: {
    disabled?: boolean;
    loading?: boolean;
    color?: string;
    textColor?: string;
  },
) {
  const callbackRef = useRef(onClick);
  callbackRef.current = onClick;

  const stableHandler = useCallback(() => {
    callbackRef.current();
  }, []);

  useEffect(() => {
    const webApp = getWebApp();
    if (!webApp) return;

    const btn = webApp.MainButton;
    btn.setText(text);

    if (options?.color) btn.setParams({ color: options.color });
    if (options?.textColor) btn.setParams({ text_color: options.textColor });

    if (options?.disabled) {
      btn.disable();
    } else {
      btn.enable();
    }

    if (options?.loading) {
      btn.showProgress(true);
    } else {
      btn.hideProgress();
    }

    btn.onClick(stableHandler);
    btn.show();

    return () => {
      btn.offClick(stableHandler);
      btn.hide();
    };
  }, [text, stableHandler, options?.disabled, options?.loading, options?.color, options?.textColor]);
}

/**
 * Control Telegram's native BackButton.
 */
export function useTelegramBackButton(onBack: (() => void) | null) {
  const callbackRef = useRef(onBack);
  callbackRef.current = onBack;

  const stableHandler = useCallback(() => {
    callbackRef.current?.();
  }, []);

  useEffect(() => {
    const webApp = getWebApp();
    if (!webApp) return;

    if (onBack) {
      webApp.BackButton.onClick(stableHandler);
      webApp.BackButton.show();
    } else {
      webApp.BackButton.hide();
    }

    return () => {
      webApp.BackButton.offClick(stableHandler);
      webApp.BackButton.hide();
    };
  }, [onBack, stableHandler]);
}

/**
 * Haptic feedback helpers.
 */
export function useTelegramHaptic() {
  const webApp = getWebApp();

  return {
    impact: (style: "light" | "medium" | "heavy" | "rigid" | "soft" = "medium") => {
      webApp?.HapticFeedback.impactOccurred(style);
    },
    notification: (type: "error" | "success" | "warning") => {
      webApp?.HapticFeedback.notificationOccurred(type);
    },
    selection: () => {
      webApp?.HapticFeedback.selectionChanged();
    },
  };
}
