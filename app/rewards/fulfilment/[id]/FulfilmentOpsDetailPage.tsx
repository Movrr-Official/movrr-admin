"use client";

import { use } from "react";
import { FulfilmentDetailPanel } from "@/components/rewards/fulfilment/FulfilmentDetailPanel";
import {
  useFulfilmentDetail,
  useFulfilmentTimeline,
} from "@/hooks/useFulfilmentOpsData";

export default function FulfilmentOpsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const detail = useFulfilmentDetail(id);
  const timeline = useFulfilmentTimeline(id);

  return (
    <div className="min-h-screen page-canvas">
      <FulfilmentDetailPanel
        fulfilment={detail.data}
        events={timeline.data}
        isLoadingDetail={detail.isLoading}
        isLoadingTimeline={timeline.isLoading}
        errorMessage={
          detail.isError
            ? ((detail.error as Error)?.message ?? "Failed to load fulfilment")
            : null
        }
      />
    </div>
  );
}
