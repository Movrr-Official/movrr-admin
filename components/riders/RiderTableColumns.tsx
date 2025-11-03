import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Star, MoreHorizontal, UserCheck, UserX, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Image from "next/image";
import { Rider } from "@/schemas";

const renderStars = (rating: number) => {
  return Array.from({ length: 5 }, (_, i) => (
    <Star
      key={i}
      className={`h-4 w-4 ${i < Math.floor(rating) ? "text-yellow-400 fill-current" : "text-gray-300"}`}
    />
  ));
};

const getStatusBadge = (status: Rider["status"]) => {
  const variants = {
    active: "default",
    inactive: "secondary",
    pending: "warning",
    suspended: "destructive",
  } as const;

  return <Badge variant={variants[status]}>{status}</Badge>;
};

export const columns: ColumnDef<Rider>[] = [
  {
    accessorKey: "name",
    header: "Rider",
    cell: ({ row }) => {
      const rider = row.original;
      return (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
            {rider.avatarUrl ? (
              <Image
                alt={row.original.name}
                src={row.original.avatarUrl!}
                width={50}
                height={20}
                className="h-10 w-10 rounded-full"
              />
            ) : (
              <span className="text-sm font-medium">
                {rider.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </span>
            )}
          </div>
          <div>
            <div className="font-medium">{rider.name}</div>
            <div className="text-sm text-muted-foreground">{rider.email}</div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => getStatusBadge(row.getValue("status")),
  },
  {
    accessorKey: "rating",
    header: "Rating",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        {renderStars(row.getValue("rating"))}
        <span className="ml-2 text-sm text-muted-foreground">
          {row.getValue("rating")}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "totalRides",
    header: "Total Rides",
  },
  {
    accessorKey: "totalEarnings",
    header: "Earnings",
    cell: ({ row }) => {
      const earnings = row.getValue("totalEarnings") as number;
      return `$${earnings.toLocaleString()}`;
    },
  },
  {
    accessorKey: "currentRoute",
    header: "Current Route",
    cell: ({ row }) => {
      const route = row.getValue("currentRoute");
      return typeof route === "string" && route.length > 0 ? (
        <Badge variant="outline">{route}</Badge>
      ) : (
        <span className="text-muted-foreground">None</span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const rider = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              Edit Profile
            </DropdownMenuItem>
            {rider.status === "active" ? (
              <DropdownMenuItem
                onClick={() => console.log("Deactivate", rider.id)}
              >
                <UserX className="mr-2 h-4 w-4" />
                Deactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => console.log("Activate", rider.id)}
              >
                <UserCheck className="mr-2 h-4 w-4" />
                Activate
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => console.log("Suspend", rider.id)}
              className="text-destructive"
            >
              <UserX className="mr-2 h-4 w-4" />
              Suspend
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
