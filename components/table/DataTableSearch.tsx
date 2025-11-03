"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface DataTableSearchProps {
  placeholder?: string;
  className?: string;
  paramKey?: string; // Allows reuse for different search params
  debounceTime?: number;
  searchOnType?: boolean;
  onSearchChange?: (value: string) => void;
  value?: string;
}

export function DataTableSearch({
  searchOnType = true,
  placeholder = "Search...",
  className = "",
  paramKey = "search",
  debounceTime = 500,
  onSearchChange,
  value: externalValue,
}: DataTableSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [inputValue, setInputValue] = useState("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with external value if provided
  useEffect(() => {
    if (externalValue !== undefined) {
      setInputValue(externalValue);
    }
  }, [externalValue]);

  // Initialize from URL params
  useEffect(() => {
    if (externalValue === undefined) {
      const initialValue = searchParams.get(paramKey) || "";
      setInputValue(initialValue);
    }
  }, [paramKey, searchParams, externalValue]);

  // Update URL with debounce
  const updateSearchParam = (value: string) => {
    if (onSearchChange) {
      // Use callback if provided
      onSearchChange(value);
    } else {
      // Fall back to URL update
      const newParams = new URLSearchParams(searchParams.toString());

      if (value.trim()) {
        newParams.set(paramKey, value.trim());
      } else {
        newParams.delete(paramKey);
      }

      router.push(`${pathname}?${newParams.toString()}`);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (!searchOnType) return;

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      updateSearchParam(value);
    }, debounceTime);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Immediate update on form submit
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    updateSearchParam(inputValue);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={inputValue}
          onChange={handleChange}
          className={`h-9 pl-10 w-full bg-muted/50 border border-border/50 rounded-xl duration-200 py-2.5 text-sm transition-all focus-visible:none ${className}`}
        />
      </div>
    </form>
  );
}
