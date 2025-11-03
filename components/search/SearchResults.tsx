"use client";

import { SearchResult } from "@/app/actions/search";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Search, User, Megaphone, MapPin } from "lucide-react";

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  query: string;
  onResultClick: (result: SearchResult) => void;
}

export function SearchResults({
  results,
  isLoading,
  query,
  onResultClick,
}: SearchResultsProps) {
  const getIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "rider":
        return <User className="h-4 w-4" />;
      case "campaign":
        return <Megaphone className="h-4 w-4" />;
      case "city":
        return <MapPin className="h-4 w-4" />;
      case "user":
        return <User className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: SearchResult["type"]) => {
    switch (type) {
      case "rider":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "campaign":
        return "text-green-600 bg-green-50 border-green-200";
      case "city":
        return "text-purple-600 bg-purple-50 border-purple-200";
      case "user":
        return "text-orange-600 bg-orange-50 border-orange-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getTypeLabel = (type: SearchResult["type"]) => {
    switch (type) {
      case "rider":
        return "Rider";
      case "campaign":
        return "Campaign";
      case "city":
        return "City";
      case "user":
        return "User";
      default:
        return type;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
        <p className="text-sm text-muted-foreground">Searching...</p>
      </div>
    );
  }

  if (results.length > 0) {
    return (
      <div className="p-4 space-y-2">
        {results.map((result, index) => (
          <motion.div
            key={`${result.type}-${result.id}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors group"
            onClick={() => onResultClick(result)}
          >
            <div
              className={`p-2 rounded-lg ${getTypeColor(result.type)} border`}
            >
              {getIcon(result.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm truncate group-hover:text-primary">
                  {result.name}
                </span>
                <Badge
                  variant="outline"
                  className={`text-xs ${getTypeColor(result.type)}`}
                >
                  {getTypeLabel(result.type)}
                </Badge>
              </div>
              {result.email && (
                <p className="text-xs text-muted-foreground truncate">
                  {result.email}
                </p>
              )}
              {result.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {result.description}
                </p>
              )}
              {result.route && (
                <p className="text-xs text-muted-foreground">
                  Route: {result.route}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (query.length >= 2) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground mb-2">
          No results found for "{query}"
        </p>
        <p className="text-xs text-muted-foreground">
          Try searching for riders, campaigns, or users
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <p className="text-sm text-muted-foreground mb-2">
        Start typing to search
      </p>
      <p className="text-xs text-muted-foreground">
        Search for riders, campaigns, cities, or users
      </p>
    </div>
  );
}
