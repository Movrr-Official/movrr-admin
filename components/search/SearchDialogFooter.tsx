"use client";

import { useModKeyLabel } from "@/hooks/useModKeyLabel";

export function SearchDialogFooter() {
  const modKey = useModKeyLabel();

  return (
    <div className="px-4 py-2.5 border-t bg-muted/30 shrink-0">
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
              ↑↓
            </kbd>
            <span>navigate</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
              ↵
            </kbd>
            <span>open</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
              esc
            </kbd>
            <span>close</span>
          </span>
        </div>
        <span className="inline-flex items-center gap-1 shrink-0">
          <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
            {modKey}
          </kbd>
          <span>+</span>
          <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
            K
          </kbd>
        </span>
      </div>
    </div>
  );
}
