import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { RESEND_API_KEY } from "@/lib/env";
import { logger } from "@/lib/logger";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HealthStatus = "operational" | "degraded" | "down";

type HealthCheck = {
  name: string;
  status: "ok" | "error";
  message?: string;
};

const checkDatabase = async (): Promise<HealthCheck> => {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("user")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      return { name: "database", status: "error", message: error.message };
    }

    return { name: "database", status: "ok" };
  } catch (error) {
    logger.error("Health check failed for database", error);
    return {
      name: "database",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

const checkRewardsRpc = async (): Promise<HealthCheck> => {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("reward_catalog")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      return { name: "rewards_rpc", status: "error", message: error.message };
    }

    return {
      name: "rewards_rpc",
      status: "ok",
      message: "Rewards catalog reachable",
    };
  } catch (error) {
    logger.error("Health check failed for rewards catalog", error);
    return {
      name: "rewards_rpc",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

const checkEmail = async (): Promise<HealthCheck> => {
  try {
    const resend = new Resend(RESEND_API_KEY);
    const { error } = await resend.domains.list();

    if (error) {
      return { name: "email", status: "error", message: error.message };
    }

    return { name: "email", status: "ok" };
  } catch (error) {
    logger.error("Health check failed for email", error);
    return {
      name: "email",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

const aggregateStatus = (checks: HealthCheck[]): HealthStatus => {
  const database = checks.find((check) => check.name === "database");
  if (database?.status === "error") return "down";
  if (checks.some((check) => check.status === "error")) return "degraded";
  return "operational";
};

export async function GET() {
  const checks = await Promise.all([
    checkDatabase(),
    checkRewardsRpc(),
    checkEmail(),
  ]);
  const status = aggregateStatus(checks);

  return NextResponse.json({
    status,
    checks,
    timestamp: new Date().toISOString(),
  });
}
