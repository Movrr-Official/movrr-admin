import { Suspense } from "react";
import PartnersPageClient from "./PartnersPageClient";

export default function PartnersPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-sm text-muted-foreground">
          Loading partners…
        </div>
      }
    >
      <PartnersPageClient />
    </Suspense>
  );
}
