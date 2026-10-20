import { riderSelfService } from "@/features/riders/application/riderSelfService";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ feature: string }> },
) {
  return riderSelfService(request, (await params).feature);
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ feature: string }> },
) {
  return riderSelfService(request, (await params).feature);
}
