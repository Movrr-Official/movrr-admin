import PartnerDetailPageClient from "./PartnerDetailPageClient";

export default function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PartnerDetailPageClient params={params} />;
}
