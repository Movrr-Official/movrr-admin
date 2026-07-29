import { redirect } from "next/navigation";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

/** Legacy full-page detail → list + drawer deep-link. */
export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(FULFILMENT_ROUTES.partnerDetail(id));
}
