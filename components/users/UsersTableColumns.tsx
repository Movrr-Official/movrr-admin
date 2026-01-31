import {
  MoreHorizontal,
  Shield,
  Building2,
  Bike,
  UserCheck,
  UserX,
  Clock,
  Mail,
  Phone,
  Edit,
  Ban,
  CheckCircle,
  KeyRound,
  Download,
  Trash2,
  Eye,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { User } from "@/schemas";

const getRoleBadge = (role: string) => {
  switch (role) {
    case "admin":
    case "super-admin":
      return (
        <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 font-medium dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
          <Shield className="h-3 w-3 mr-1" />
          {role === "super-admin" ? "Super Admin" : "Admin"}
        </Badge>
      );
    case "advertiser":
      return (
        <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
          <Building2 className="h-3 w-3 mr-1" />
          Advertiser
        </Badge>
      );
    case "rider":
      return (
        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 font-medium">
          <Bike className="h-3 w-3 mr-1" />
          Rider
        </Badge>
      );
    case "moderator":
      return (
        <Badge className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 font-medium dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">
          <Shield className="h-3 w-3 mr-1" />
          Moderator
        </Badge>
      );
    case "support":
      return (
        <Badge className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200 font-medium dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <Shield className="h-3 w-3 mr-1" />
          Support
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="font-medium">
          {role}
        </Badge>
      );
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 font-medium dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <UserCheck className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    case "inactive":
      return (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 font-medium dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
        >
          <UserX className="h-3 w-3 mr-1" />
          Inactive
        </Badge>
      );
    case "pending":
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
        >
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

interface UsersTableColumnsProps {
  onEdit?: (user: User) => void;
  onStatusChange?: (user: User) => void;
  onRoleChange?: (user: User) => void;
  onResetPassword?: (user: User) => void;
  onExportData?: (user: User) => void;
  onDelete?: (user: User) => void;
}

export const getUsersTableColumns = ({
  onEdit,
  onStatusChange,
  onRoleChange,
  onResetPassword,
  onExportData,
  onDelete,
}: UsersTableColumnsProps = {}): ColumnDef<User>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "User",
    cell: ({ row }) => {
      const user = row.original;
      const isVerified = user.isVerified;
      return (
        <div className="flex items-center gap-3 min-w-[200px]">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-foreground truncate">
                {user.name}
              </div>
              {isVerified && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300"
                >
                  <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                  Verified
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground truncate sm:hidden">
              {user.email}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <div className="flex items-center gap-2 min-w-[180px]">
        <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="text-muted-foreground font-medium truncate">
          {row.getValue("email")}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => getRoleBadge(row.getValue("role")),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => getStatusBadge(row.getValue("status")),
  },
  {
    accessorKey: "lastLogin",
    header: "Last Active",
    cell: ({ row }) => {
      const lastLogin = row.getValue("lastLogin") as string | undefined;
      if (!lastLogin) {
        return (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground/50" />
            <span className="text-muted-foreground text-sm font-medium">
              Never
            </span>
          </div>
        );
      }
      const date = new Date(lastLogin);
      const now = new Date();
      const diffDays = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      );

      return (
        <div className="text-muted-foreground font-medium">
          {diffDays === 0
            ? "Today"
            : diffDays === 1
              ? "Yesterday"
              : diffDays < 7
                ? `${diffDays} days ago`
                : format(date, "MMM d, yyyy")}
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Joined",
    cell: ({ row }) => {
      const date = new Date(row.getValue("createdAt"));
      return (
        <div className="text-muted-foreground font-medium">
          {format(date, "MMM d, yyyy")}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const user = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onEdit?.(user)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit?.(user)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit User
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onStatusChange?.(user)}>
              {user.status === "active" ? (
                <>
                  <Ban className="mr-2 h-4 w-4" />
                  Deactivate
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Activate
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRoleChange?.(user)}>
              <Shield className="mr-2 h-4 w-4" />
              Change Role
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onResetPassword?.(user)}>
              <KeyRound className="mr-2 h-4 w-4" />
              Reset Password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExportData?.(user)}>
              <Download className="mr-2 h-4 w-4" />
              Export Data
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete?.(user)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
