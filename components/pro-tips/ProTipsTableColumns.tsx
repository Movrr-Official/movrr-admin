import { MoreHorizontal, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ProTip } from "@/schemas";

const CATEGORY_COLORS: Record<string, string> = {
  earning: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
  timing: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  compliance: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  performance: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
  technical: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300",
  planning: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300",
};

interface ProTipsTableColumnsProps {
  onEdit?: (tip: ProTip) => void;
  onDelete?: (tip: ProTip) => void;
  onToggleActive?: (tip: ProTip) => void;
}

export const getProTipsTableColumns = ({
  onEdit,
  onDelete,
  onToggleActive,
}: ProTipsTableColumnsProps = {}): ColumnDef<ProTip>[] => [
  {
    accessorKey: "priority",
    header: "#",
    cell: ({ row }) => (
      <span className="text-sm font-mono text-muted-foreground w-6 text-center block">
        {row.original.priority}
      </span>
    ),
  },
  {
    accessorKey: "text",
    header: "Tip",
    cell: ({ row }) => {
      const tip = row.original;
      return (
        <div className="flex items-start gap-3 min-w-[300px] max-w-[520px]">
          <span className="text-xl flex-shrink-0 mt-0.5">{tip.icon}</span>
          <p className="text-sm text-foreground leading-relaxed line-clamp-3">
            {tip.text}
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => {
      const cat = row.original.category;
      if (!cat) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <Badge
          className={`font-medium capitalize ${CATEGORY_COLORS[cat] ?? "bg-muted text-muted-foreground"}`}
        >
          {cat}
        </Badge>
      );
    },
  },
  {
    accessorKey: "isActive",
    header: "Active",
    cell: ({ row }) => {
      const tip = row.original;
      return (
        <Switch
          checked={tip.isActive}
          onCheckedChange={() => onToggleActive?.(tip)}
          aria-label={tip.isActive ? "Deactivate tip" : "Activate tip"}
        />
      );
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Last Updated",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(row.original.updatedAt), {
          addSuffix: true,
        })}
      </span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const tip = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-card border-0">
            <DropdownMenuItem onClick={() => onEdit?.(tip)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Tip
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive?.(tip)}>
              {tip.isActive ? (
                <>
                  <EyeOff className="mr-2 h-4 w-4" />
                  Deactivate
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Activate
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete?.(tip)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Tip
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
