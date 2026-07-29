import FulfilmentOpsDetailPage from "./FulfilmentOpsDetailPage";

export default function FulfilmentDetailRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <FulfilmentOpsDetailPage params={params} />;
}
