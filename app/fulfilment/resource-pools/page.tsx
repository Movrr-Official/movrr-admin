import { Suspense } from "react";
import ResourcePoolsPageClient from "./ResourcePoolsPageClient";

export default function ResourcePoolsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-sm text-muted-foreground">
          Loading resource pools…
        </div>
      }
    >
      <ResourcePoolsPageClient />
    </Suspense>
  );
}
