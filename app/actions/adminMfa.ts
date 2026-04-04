"use server";

import { revalidatePath } from "next/cache";

import { requireAdminRoles } from "@/lib/admin";
import {
  DASHBOARD_ACCESS_ROLES,
} from "@/lib/authPermissions";
import {
  getAdminMfaContext,
  recordAdminMfaChallengeResult,
  recordAdminMfaEnrollment,
  writeAdminMfaEvent,
} from "@/lib/adminMfa";
import {
  ADMIN_MFA_FACTOR_REMOVED_ACTIVITY_ACTION,
  ADMIN_MFA_FACTOR_REMOVED_AUDIT_ACTION,
  ADMIN_MFA_RECOVERY_RESET_ACTIVITY_ACTION,
  ADMIN_MFA_RECOVERY_RESET_AUDIT_ACTION,
} from "@/lib/adminAccessMonitoring";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const MFA_MANAGEMENT_PATH = "/account/security";
const MIN_RECOVERY_REASON_LENGTH = 20;

type ManagedFactorRow = {
  created_at?: string | null;
  factor_type?: string | null;
  friendly_name?: string | null;
  id: string;
  status?: string | null;
  updated_at?: string | null;
};

type ElevatedAdminMfaSession = {
  auth: Awaited<ReturnType<typeof requireAdminRoles>>;
  context: Awaited<ReturnType<typeof getAdminMfaContext>> & {
    adminUser: NonNullable<Awaited<ReturnType<typeof getAdminMfaContext>>["adminUser"]>;
    currentLevel: "aal2";
    user: NonNullable<Awaited<ReturnType<typeof getAdminMfaContext>>["user"]>;
  };
};

const normalizeFriendlyName = (factor: ManagedFactorRow) =>
  factor.friendly_name?.trim() || `${factor.factor_type?.toUpperCase() ?? "MFA"} factor`;

const getTargetAdminByUserIdOrEmail = async (input: {
  email?: string;
  userId?: string;
}) => {
  const supabaseAdmin = createSupabaseAdminClient();
  let query = supabaseAdmin
    .from("admin_users")
    .select("id, user_id, email, role");

  if (input.userId) {
    query = query.eq("user_id", input.userId);
  } else if (input.email) {
    query = query.eq("email", input.email.toLowerCase());
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle<{
    id: string;
    user_id: string;
    email: string;
    role: string;
  }>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const listFactorsForUser = async (userId: string) => {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({
    userId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data?.factors ?? []) as ManagedFactorRow[];
};

const requireElevatedAdminMfaSession = async (
  allowedRoles: readonly string[],
): Promise<ElevatedAdminMfaSession> => {
  const auth = await requireAdminRoles(allowedRoles);
  const context = await getAdminMfaContext();

  if (!context.user || !context.adminUser) {
    throw new Error("Authentication required.");
  }

  if (context.user.id !== auth.authUser.id) {
    throw new Error("Authenticated admin context mismatch.");
  }

  if (context.currentLevel !== "aal2") {
    throw new Error("An elevated MFA session is required for this action.");
  }

  return {
    auth,
    context: {
      ...context,
      adminUser: context.adminUser,
      currentLevel: "aal2",
      user: context.user,
    },
  };
};

export async function removeOwnAdminMfaFactor(input: { factorId: string }) {
  try {
    const factorId = input.factorId?.trim();

    if (!factorId) {
      return { success: false as const, error: "Factor id is required." };
    }

    const { auth, context } =
      await requireElevatedAdminMfaSession(DASHBOARD_ACCESS_ROLES);
    const factors = await listFactorsForUser(auth.authUser.id);
    const factor = factors.find((candidate) => candidate.id === factorId);

    if (!factor) {
      return { success: false as const, error: "MFA factor not found." };
    }

    const verifiedFactorCount = factors.filter(
      (candidate) => candidate.status === "verified",
    ).length;

    if (factor.status === "verified" && verifiedFactorCount <= 1) {
      return {
        success: false as const,
        error:
          "You cannot remove your last verified MFA factor. Enroll another authenticator first.",
      };
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
      userId: auth.authUser.id,
      id: factorId,
    });

    if (error) {
      return { success: false as const, error: error.message };
    }

    await writeAdminMfaEvent({
      action: ADMIN_MFA_FACTOR_REMOVED_AUDIT_ACTION,
      activityAction: ADMIN_MFA_FACTOR_REMOVED_ACTIVITY_ACTION,
      actorAdmin: context.adminUser,
      actorUser: context.user,
      description: `${context.adminUser.email} removed an MFA factor from their admin account.`,
      factorId,
      metadata: {
        factor_type: factor.factor_type ?? "unknown",
        factor_status: factor.status ?? "unknown",
        friendly_name: normalizeFriendlyName(factor),
        ownership: "self",
      },
    });

    revalidatePath(MFA_MANAGEMENT_PATH);

    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to remove MFA factor.",
    };
  }
}

export async function resetAdminMfaRecovery(input: {
  reason: string;
  targetAdminEmail?: string;
  targetAdminUserId?: string;
}) {
  try {
    const reason = input.reason?.trim();

    if (!reason || reason.length < MIN_RECOVERY_REASON_LENGTH) {
      return {
        success: false as const,
        error: `Provide a recovery reason with at least ${MIN_RECOVERY_REASON_LENGTH} characters.`,
      };
    }

    const { auth, context } = await requireElevatedAdminMfaSession([
      "super_admin",
    ]);
    const targetAdmin = await getTargetAdminByUserIdOrEmail({
      email: input.targetAdminEmail?.trim(),
      userId: input.targetAdminUserId?.trim(),
    });

    if (!targetAdmin) {
      return { success: false as const, error: "Target admin account not found." };
    }

    if (targetAdmin.user_id === auth.authUser.id) {
      return {
        success: false as const,
        error: "Use self-service factor management for your own account.",
      };
    }

    const factors = await listFactorsForUser(targetAdmin.user_id);

    if (factors.length === 0) {
      return {
        success: false as const,
        error: "That admin account has no MFA factors to reset.",
      };
    }

    const supabaseAdmin = createSupabaseAdminClient();

    for (const factor of factors) {
      const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
        userId: targetAdmin.user_id,
        id: factor.id,
      });

      if (error) {
        throw new Error(error.message);
      }
    }

    await writeAdminMfaEvent({
      action: ADMIN_MFA_RECOVERY_RESET_AUDIT_ACTION,
      activityAction: ADMIN_MFA_RECOVERY_RESET_ACTIVITY_ACTION,
      actorAdmin: context.adminUser,
      actorUser: context.user,
      description: `${context.adminUser.email} performed an emergency MFA recovery reset for ${targetAdmin.email}.`,
      metadata: {
        deleted_factor_count: factors.length,
        factor_ids: factors.map((factor) => factor.id),
        reason,
      },
      relatedUserId: targetAdmin.user_id,
      targetAdmin,
    });

    revalidatePath(MFA_MANAGEMENT_PATH);

    return { success: true as const, deletedFactorCount: factors.length };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to reset admin MFA.",
    };
  }
}

export async function recordAdminMfaEnrollmentSuccess(input: {
  factorId: string;
  redirectTo?: string;
}) {
  try {
    await recordAdminMfaEnrollment(input.factorId, {
      redirect_to: input.redirectTo ?? MFA_MANAGEMENT_PATH,
    });

    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error ? error.message : "Failed to record MFA enrollment.",
    };
  }
}

export async function recordAdminMfaChallengeEvent(input: {
  factorId?: string;
  message?: string;
  success: boolean;
}) {
  try {
    await recordAdminMfaChallengeResult(input);
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error ? error.message : "Failed to record MFA challenge event.",
    };
  }
}
