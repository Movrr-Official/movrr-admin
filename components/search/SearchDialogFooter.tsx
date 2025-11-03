export function SearchDialogFooter() {
  return (
    <div className="px-6 py-3 border-t bg-muted/20">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Press Esc to close</span>
        <div className="flex items-center gap-1">
          <kbd className="px-2 py-1 rounded border bg-background font-mono">
            ⌘
          </kbd>
          <span>+</span>
          <kbd className="px-2 py-1 rounded border bg-background font-mono">
            K
          </kbd>
        </div>
      </div>
    </div>
  );
}
