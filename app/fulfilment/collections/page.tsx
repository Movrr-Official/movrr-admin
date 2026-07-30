import { Suspense } from "react";
import CollectionsPageClient from "./CollectionsPageClient";

export default function CollectionsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-sm text-muted-foreground">
          Loading collections…
        </div>
      }
    >
      <CollectionsPageClient />
    </Suspense>
  );
}
