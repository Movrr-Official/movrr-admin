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
  earning:
    "border-transparent bg-gradient-to-r from-green-500 to-green-600 text-white shadow-green-500/20",
  timing:
    "border-transparent bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/20",
  compliance:
    "border-transparent bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-amber-500/20",
  performance:
    "border-transparent bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-purple-500/20",
  technical:
    "border-transparent bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-cyan-500/20",
  planning:
    "border-transparent bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-orange-500/20",
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
          className={`font-medium capitalize shadow-sm ${CATEGORY_COLORS[cat] ?? "border-transparent bg-gradient-to-r from-muted to-muted/80 text-foreground"}`}
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
