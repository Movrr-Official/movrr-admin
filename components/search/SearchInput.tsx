"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchInputProps {
  query: string;
  onQueryChange: (query: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

export function SearchInput({
  query,
  onQueryChange,
  inputRef,
}: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        placeholder="Search riders, campaigns, cities, users..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="pl-10 pr-4 py-2 bg-background border-border rounded-lg"
      />
      {query && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
          onClick={() => onQueryChange("")}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
