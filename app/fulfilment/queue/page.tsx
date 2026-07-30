import { Suspense } from "react";
import FulfilmentOpsQueuePage from "./FulfilmentOpsQueuePage";

export default function FulfilmentQueueRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-sm text-muted-foreground">
          Loading fulfilment queue…
        </div>
      }
    >
      <FulfilmentOpsQueuePage />
    </Suspense>
  );
}
