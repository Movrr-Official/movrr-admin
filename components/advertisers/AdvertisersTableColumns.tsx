import { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import {
  BadgeCheck,
  Building2,
  Clock,
  Edit,
  Eye,
  Mail,
  MoreHorizontal,
  Phone,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";

import { Advertiser } from "@/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const getStatusBadge = (status: Advertiser["status"]) => {
  if (status === "active") {
    return (
      <Badge variant="success">
        <UserCheck className="mr-1 h-3 w-3" />
        Active
      </Badge>
    );
  }

  if (status === "pending") {
    return (
      <Badge variant="info">
        <Clock className="mr-1 h-3 w-3" />
        Pending
      </Badge>
    );
  }

  return (
    <Badge variant="warning">
      <UserX className="mr-1 h-3 w-3" />
      Inactive
    </Badge>
  );
};

interface AdvertisersTableColumnsProps {
  onView?: (advertiser: Advertiser) => void;
  onEdit?: (advertiser: Advertiser) => void;
  onDelete?: (advertiser: Advertiser) => void;
}

export const getAdvertisersTableColumns = ({
  onView,
  onEdit,
  onDelete,
}: AdvertisersTableColumnsProps = {}): ColumnDef<Advertiser>[] => [
  {
    accessorKey: "companyName",
    header: "Advertiser",
    cell: ({ row }) => {
      const advertiser = row.original;
      return (
        <div className="flex min-w-[220px] items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {advertiser.companyName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {advertiser.contactName || "No contact name"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              ID: {advertiser.id.slice(0, 8)}
            </p>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "email",
    header: "Contact",
    cell: ({ row }) => {
      const advertiser = row.original;
      return (
        <div className="space-y-1 text-sm min-w-[220px]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            <span className="truncate">{advertiser.email || "No email"}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            <span className="truncate">{advertiser.phone || "No phone"}</span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => getStatusBadge(row.original.status),
  },
  {
    accessorKey: "totalCampaigns",
    header: "Campaigns",
    cell: ({ row }) => {
      const advertiser = row.original;
      return (
        <div className="space-y-1 min-w-[110px]">
          <p className="text-sm font-semibold text-foreground">
            {advertiser.totalCampaigns}
          </p>
          <p className="text-xs text-muted-foreground">
            {advertiser.activeCampaigns} active
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: "verified",
    header: "Verification",
    cell: ({ row }) => (
      <Badge variant={row.original.verified ? "success" : "secondary"}>
        <BadgeCheck className="mr-1 h-3 w-3" />
        {row.original.verified ? "Verified" : "Unverified"}
      </Badge>
    ),
  },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    cell: ({ row }) => {
      const updatedAt = new Date(row.original.updatedAt);
      return (
        <div className="min-w-[130px]">
          <p className="text-sm font-medium text-foreground">
            {format(updatedAt, "MMM d, yyyy")}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(updatedAt, { addSuffix: true })}
          </p>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const advertiser = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView?.(advertiser)}>
              <Eye className="mr-2 h-4 w-4" />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit?.(advertiser)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit advertiser
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete?.(advertiser)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete advertiser
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
