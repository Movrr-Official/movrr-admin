"use client";

import { useEffect, useState } from "react";

export type ModKeyLabel = "⌘" | "Ctrl";

/**
 * Platform-aware modifier key label for shortcut hints.
 * Defaults to Ctrl (SSR / Windows) and switches to ⌘ on Apple platforms.
 */
export function useModKeyLabel(): ModKeyLabel {
  const [label, setLabel] = useState<ModKeyLabel>("Ctrl");

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    const isApple =
      /Mac|iPhone|iPod|iPad/i.test(platform) ||
      /Mac OS X|Macintosh|iPhone|iPad/i.test(ua);
    setLabel(isApple ? "⌘" : "Ctrl");
  }, []);

  return label;
}
