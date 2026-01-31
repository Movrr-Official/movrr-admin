"use client";

import { useState, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { globalSearch, SearchResult } from "@/app/actions/search";
import { useRouter } from "next/navigation";
import { SearchInput } from "./SearchInput";
import { SearchResults } from "./SearchResults";
import { SearchDialogFooter } from "./SearchDialogFooter";

interface SearchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ isOpen, onOpenChange }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null!);
  const router = useRouter();

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Search with debounce
  useEffect(() => {
    if (!isOpen || query.length < 2) {
      setResults([]);
      return;
    }

    const searchTimer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const searchResults = await globalSearch(query);
        setResults(searchResults);
      } catch (error) {
        console.error("Search failed:", error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [query, isOpen]);

  const handleResultClick = (result: SearchResult) => {
    let route = "";

    switch (result.type) {
      case "rider":
        route = `/riders/${result.id}`;
        break;
      case "campaign":
        route = `/campaigns/${result.id}`;
        break;
      case "user":
        route = `/users/${result.id}`;
        break;
      case "city":
        route = `/cities/${result.id}`;
        break;
    }

    if (route) {
      router.push(route);
      handleClose();
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setQuery("");
    setResults([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl h-[60vh] flex flex-col glass-card border-0 backdrop-blur-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search
          </DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="px-6 py-4 border-b">
          <SearchInput
            query={query}
            onQueryChange={setQuery}
            inputRef={inputRef}
          />
        </div>

        {/* Search Results */}
        <div className="flex-1 overflow-y-auto">
          <SearchResults
            results={results}
            isLoading={isLoading}
            query={query}
            onResultClick={handleResultClick}
          />
        </div>

        {/* Footer with Keyboard Shortcut */}
        <SearchDialogFooter />
      </DialogContent>
    </Dialog>
  );
}
