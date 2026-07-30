"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useModKeyLabel } from "@/hooks/useModKeyLabel";
import { SearchDialog } from "./SearchDialog";

interface GlobalSearchProps {
  className?: string;
}

export function GlobalSearch({ className = "" }: GlobalSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const modKey = useModKeyLabel();

  // Keyboard shortcut (Cmd+K or Ctrl+K) — toggles open/close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Desktop trigger */}
      <div className={`flex-1 max-w-[400px] hidden md:block ${className}`}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            onFocus={() => setIsOpen(true)}
            readOnly
            className="pl-10 pr-12 py-2 bg-muted/50 border-border/50 rounded-xl focus:bg-background transition-all duration-200"
          />
          <kbd className="pointer-events-none absolute right-1.5 top-1/2 transform -translate-y-1/2 h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium hidden xl:flex">
            {modKey === "⌘" ? (
              <>
                <span className="text-xs">⌘</span>K
              </>
            ) : (
              <span className="text-[10px]">Ctrl+K</span>
            )}
          </kbd>
        </div>
      </div>

      {/* Mobile trigger */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="md:hidden p-2 hover:bg-muted"
        onClick={() => setIsOpen(true)}
        aria-label="Open search"
      >
        <Search className="h-5 w-5" />
      </Button>

      <SearchDialog isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
