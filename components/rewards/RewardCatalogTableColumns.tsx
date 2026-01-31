import { ColumnDef } from "@tanstack/react-table";
import {
  CheckCircle2,
  MoreHorizontal,
  PauseCircle,
  Archive,
  Star,
  Pencil,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RewardCatalogItem } from "@/schemas";
import Image from "next/image";

interface RewardCatalogTableColumnsProps {
  onEdit: (item: RewardCatalogItem) => void;
  onPublish: (item: RewardCatalogItem) => void;
  onPause: (item: RewardCatalogItem) => void;
  onArchive: (item: RewardCatalogItem) => void;
  onToggleFeatured: (item: RewardCatalogItem) => void;
}

const statusBadge = (status: RewardCatalogItem["status"]) => {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">
          Active
        </Badge>
      );
    case "paused":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
          Paused
        </Badge>
      );
    case "archived":
      return <Badge variant="outline">Archived</Badge>;
    default:
      return <Badge variant="secondary">Draft</Badge>;
  }
};

export function getRewardCatalogTableColumns({
  onEdit,
  onPublish,
  onPause,
  onArchive,
  onToggleFeatured,
}: RewardCatalogTableColumnsProps): ColumnDef<RewardCatalogItem>[] {
  return [
    {
      accessorKey: "title",
      header: "Product",
      cell: ({ row }) => {
        const item = row.original;
        const imageUrl = item.thumbnailUrl ?? item.galleryUrls?.[0];
        const fallback = item.title
          .split(" ")
          .map((word) => word[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();

        return (
          <div className="flex items-center gap-3 min-w-[220px]">
            <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={item.title}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                  sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, 100vw"
                  quality={100}
                  priority
                />
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">
                  {fallback}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {item.sku}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <span className="text-sm capitalize">{row.original.category}</span>
      ),
    },
    {
      accessorKey: "pointsPrice",
      header: "Points",
      cell: ({ row }) => (
        <span className="text-sm font-semibold">
          {row.original.pointsPrice.toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      accessorKey: "partnerName",
      header: "Partner",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.partnerName ?? "—"}</span>
      ),
    },
    {
      accessorKey: "isFeatured",
      header: "Featured",
      cell: ({ row }) =>
        row.original.isFeatured ? (
          <span className="inline-flex items-center gap-1 text-amber-600 text-sm">
            <Star className="h-4 w-4" /> Featured
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(item)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleFeatured(item)}>
                <Star className="h-4 w-4 mr-2" />
                {item.isFeatured ? "Remove featured" : "Mark featured"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {item.status !== "active" && (
                <DropdownMenuItem onClick={() => onPublish(item)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Publish
                </DropdownMenuItem>
              )}
              {item.status === "active" && (
                <DropdownMenuItem onClick={() => onPause(item)}>
                  <PauseCircle className="h-4 w-4 mr-2" />
                  Pause
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onArchive(item)}>
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
