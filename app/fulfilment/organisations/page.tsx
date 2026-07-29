import { Suspense } from "react";
import OrganisationsPageClient from "./OrganisationsPageClient";

export default function OrganisationsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-sm text-muted-foreground">
          Loading organisations…
        </div>
      }
    >
      <OrganisationsPageClient />
    </Suspense>
  );
}
