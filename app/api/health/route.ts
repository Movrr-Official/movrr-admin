import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
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
    return {
      name: "rewards_rpc",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

const checkEmail = async (): Promise<HealthCheck> => {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return {
        name: "email",
        status: "error",
        message: "RESEND_API_KEY is not configured",
      };
    }

    const resend = new Resend(apiKey);
    const { error } = await resend.domains.list();

    if (error) {
      return { name: "email", status: "error", message: error.message };
    }

    return { name: "email", status: "ok" };
  } catch (error) {
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
