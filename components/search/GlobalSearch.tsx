"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { SearchDialog } from "./SearchDialog";

interface GlobalSearchProps {
  className?: string;
}

export function GlobalSearch({ className = "" }: GlobalSearchProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Keyboard shortcut (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Search Trigger */}
      <div className={`flex-1 max-w-[400px] hidden md:block ${className}`}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            onFocus={() => setIsOpen(true)}
            readOnly
            className="pl-10 pr-4 py-2 bg-muted/50 border-border/50 rounded-xl focus:bg-background transition-all duration-200"
          />
          <kbd className="pointer-events-none absolute right-1.5 top-1/2 transform -translate-y-1/2 h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 xl:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </div>

      {/* Search Dialog */}
      <SearchDialog isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
