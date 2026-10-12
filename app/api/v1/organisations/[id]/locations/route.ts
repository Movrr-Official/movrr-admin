import { locationOperationsRoute } from "@/features/partners/infrastructure/partnerLocationRoutes";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return locationOperationsRoute(request, (await params).id);
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return locationOperationsRoute(request, (await params).id);
}
