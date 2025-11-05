"use client";

import {
  PlusCircle,
  FileText,
  BookOpen,
  Database,
  Package,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface EmptyStateProps {
  title?: string;
  description?: string;
  iconName?: "file" | "book" | "database" | "search" | "package" | "default";
  buttonText?: string;
  buttonAction?: () => void;
  navigateTo?: string;
}

export function EmptyState({
  title = "No content available",
  description = "Get started by creating your first item",
  iconName = "default",
  buttonText = "Create New",
  buttonAction,
  navigateTo,
}: EmptyStateProps) {
  const router = useRouter();

  const icons = {
    file: <FileText className="h-10 w-10" />,
    book: <BookOpen className="h-10 w-10" />,
    search: <Search className="h-10 w-10" />,
    database: <Database className="h-10 w-10" />,
    package: <Package className="h-10 w-10" />,
    default: <FileText className="h-10 w-10" />,
  };

  const handleClick = () => {
    if (buttonAction) {
      buttonAction();
    } else if (navigateTo) {
      router.push(navigateTo);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="bg-muted dark:bg-muted/30 p-4 rounded-full mb-4 text-muted-foreground/60">
        {icons[iconName]}
      </div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-md mb-4">
        {description}
      </p>

      {(buttonAction || navigateTo) && (
        <Button size="sm" onClick={handleClick} className="mt-4">
          <PlusCircle className="mr-2 h-4 w-4" />
          {buttonText}
        </Button>
      )}
    </div>
  );
}
