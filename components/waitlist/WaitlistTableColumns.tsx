import { Bike } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { WaitlistEntry } from "@/types/types";

const getBikeOwnershipBadge = (ownership: string) => {
  switch (ownership) {
    case "yes":
      return (
        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 font-medium">
          <Bike className="h-3 w-3 mr-1" />
          Owns Bike
        </Badge>
      );
    case "no":
      return (
        <Badge
          variant="secondary"
          className="bg-muted text-muted-foreground hover:bg-muted/80 font-medium"
        >
          No Bike
        </Badge>
      );
    case "planning":
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
        >
          Planning to Get
        </Badge>
      );
    default:
      return <Badge variant="secondary">{ownership}</Badge>;
  }
};

export const columns: ColumnDef<WaitlistEntry>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      return (
        <div>
          <div className="font-semibold text-foreground">
            {row.original.name}
          </div>
          <div className="text-sm text-muted-foreground sm:hidden">
            {row.original.email}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <div className="text-muted-foreground font-medium">
        {row.getValue("email")}
      </div>
    ),
  },
  {
    accessorKey: "city",
    header: "City",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className="bg-blue-50 text-blue-700 border-blue-200 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
      >
        {row.getValue("city")}
      </Badge>
    ),
  },
  {
    accessorKey: "bike_ownership",
    header: "Bike Status",
    cell: ({ row }) => getBikeOwnershipBadge(row.getValue("bike_ownership")),
  },
  {
    accessorKey: "created_at",
    header: "Signup Date",
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at"));
      return (
        <div className="text-muted-foreground font-medium">
          {date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "2-digit",
          })}
        </div>
      );
    },
  },
];
