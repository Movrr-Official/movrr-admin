import { DataTableSkeleton } from "./DataTableSkeleton";

export function RidersSkeleton() {
  return (
    <DataTableSkeleton
      title="Loading Riders"
      description="Fetching rider data..."
      rowCount={10}
      columnCount={7}
    />
  );
}
