"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  value: string;
  className?: string;
  showText?: boolean;
}

export function CopyButton({
  value,
  className,
  showText = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`ml-2 text-muted-foreground hover:text-primary transition-colors cursor-pointer ${className || ""}`}
    >
      <span className="sr-only">Copy</span>
      {copied ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
      {copied && showText && (
        <span className="text-xs text-green-500">Copied!</span>
      )}
    </button>
  );
}
