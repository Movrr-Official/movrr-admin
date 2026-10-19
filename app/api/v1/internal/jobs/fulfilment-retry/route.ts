import { shopRecoveryRoute } from "@/features/fulfilment/infrastructure/shopRecoveryRoute";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const POST = shopRecoveryRoute;
export const GET = shopRecoveryRoute;

export const maxDuration = 60;
