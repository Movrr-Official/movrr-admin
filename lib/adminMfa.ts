import "server-only";

import type { AuthenticatorAssuranceLevels, Factor, User } from "@supabase/supabase-js";

import {
  ADMIN_MFA_CHALLENGE_ACTIVITY_ACTION,
  ADMIN_MFA_CHALLENGE_AUDIT_ACTION,
  ADMIN_MFA_ENROLLED_ACTIVITY_ACTION,
  ADMIN_MFA_ENROLLED_AUDIT_ACTION,
  ADMIN_MFA_FACTOR_REMOVED_ACTIVITY_ACTION,
  ADMIN_MFA_FACTOR_REMOVED_AUDIT_ACTION,
  ADMIN_MFA_RECOVERY_RESET_ACTIVITY_ACTION,
  ADMIN_MFA_RECOVERY_RESET_AUDIT_ACTION,
} from "@/lib/adminAccessMonitoring";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { writeUserActivity } from "@/lib/userActivity";
import { createSupabaseServerClient } from "@/supabase/server";

type AdminMfaAdminUser = {
  id: string;
  user_id: string;
  email: string;
  role: string;
};

type AdminProfileRow = {
  user_id: string;
  email: string;
  role: string;
};

export type AdminMfaManagedFactor = {
  createdAt: string | null;
  factorType: string;
  friendlyName: string;
  id: string;
  status: string;
  updatedAt: string | null;
};

export type AdminMfaRecoveryCandidate = {
  displayName: string;
  email: string;
  role: string;
  userId: string;
};

export type AdminMfaContext = {
  adminUser: AdminMfaAdminUser | null;
  currentLevel: AuthenticatorAssuranceLevels | null;
  nextLevel: AuthenticatorAssuranceLevels | null;
  user: User | null;
  factors: Factor[];
  verifiedFactors: Factor[];
};

export type AdminMfaManagementData = {
  adminUser: AdminMfaAdminUser;
  availableRecoveryTargets: AdminMfaRecoveryCandidate[];
  currentLevel: AuthenticatorAssuranceLevels | null;
  factors: AdminMfaManagedFactor[];
  user: User;
  verifiedFactorCount: number;
};

type AdminMfaEventInput = {
  action: string;
  activityAction: string;
  actorAdmin: AdminMfaAdminUser;
  actorUser: User;
  description: string;
  factorId?: string | null;
  metadata?: Record<string, unknown>;
  relatedUserId?: string;
  result?: "Success" | "Failed" | "Pending";
  targetAdmin?: AdminMfaAdminUser | null;
};

const normalizeFriendlyName = (factor: {
  friendly_name?: string | null;
  factor_type?: string | null;
}) => factor.friendly_name?.trim() || `${factor.factor_type?.toUpperCase() ?? "MFA"} factor`;

const toManagedFactor = (factor: {
  created_at?: string | null;
  factor_type?: string | null;
  friendly_name?: string | null;
  id: string;
  status?: string | null;
  updated_at?: string | null;
}): AdminMfaManagedFactor => ({
  createdAt: factor.created_at ?? null,
  factorType: factor.factor_type ?? "unknown",
  friendlyName: normalizeFriendlyName(factor),
  id: factor.id,
  status: factor.status ?? "unknown",
  updatedAt: factor.updated_at ?? null,
});

const buildPerformedBy = (adminUser: AdminMfaAdminUser, user: User) => ({
  id: user.id,
  name:
    (typeof user.user_metadata?.full_name === "string" &&
    user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : undefined) ||
    user.email ||
    adminUser.email,
  email: adminUser.email,
  role: adminUser.role,
});

const getUserDisplayName = (candidate: AdminProfileRow) =>
  candidate.email || "Admin user";

const listManagedFactorsForUser = async (userId: string) => {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({
    userId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data?.factors ?? []).map(toManagedFactor);
};

const getAdminUserByUserId = async (userId: string) => {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("id, user_id, email, role")
    .eq("user_id", userId)
    .maybeSingle<AdminMfaAdminUser>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export async function getServerAdminAuthenticatorAssurance(user: User) {
  const supabase = await createSupabaseServerClient();
  const [{ data: claimsData, error: claimsError }, { data: factorData, error: factorError }] =
    await Promise.all([
      supabase.auth.getClaims(),
      supabase.auth.mfa.listFactors(),
    ]);

  if (claimsError) {
    throw new Error(claimsError.message);
  }

  if (factorError) {
    throw new Error(factorError.message);
  }

  const claims = claimsData?.claims as { aal?: string | null } | undefined;
  const factors = factorData?.all ?? user.factors ?? [];
  const verifiedFactors = factors.filter((factor) => factor.status === "verified");
  const currentLevel: AuthenticatorAssuranceLevels | null =
    claims?.aal === "aal2"
      ? "aal2"
      : claims?.aal === "aal1"
        ? "aal1"
        : null;
  const nextLevel: AuthenticatorAssuranceLevels | null =
    verifiedFactors.length > 0 ? "aal2" : currentLevel;

  return {
    currentLevel,
    factors,
    nextLevel,
    verifiedFactors,
  };
}

export async function getAdminMfaContext(): Promise<AdminMfaContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      adminUser: null,
      currentLevel: null,
      nextLevel: null,
      user: null,
      factors: [],
      verifiedFactors: [],
    };
  }

  const adminUser = await getAdminUserByUserId(user.id);

  if (!adminUser) {
    return {
      adminUser: null,
      currentLevel: null,
      nextLevel: null,
      user,
      factors: [],
      verifiedFactors: [],
    };
  }

  const assurance = await getServerAdminAuthenticatorAssurance(user);

  return {
    adminUser,
    currentLevel: assurance.currentLevel,
    nextLevel: assurance.nextLevel,
    user,
    factors: assurance.factors,
    verifiedFactors: assurance.verifiedFactors,
  };
}

export async function getAdminMfaManagementData(): Promise<AdminMfaManagementData | null> {
  const context = await getAdminMfaContext();

  if (!context.user || !context.adminUser) {
    return null;
  }

  const [factors, availableRecoveryTargets] = await Promise.all([
    listManagedFactorsForUser(context.user.id),
    context.adminUser.role === "super_admin"
      ? getAdminMfaRecoveryCandidates(context.user.id)
      : Promise.resolve([]),
  ]);

  return {
    adminUser: context.adminUser,
    availableRecoveryTargets,
    currentLevel: context.currentLevel,
    factors,
    user: context.user,
    verifiedFactorCount: factors.filter((factor) => factor.status === "verified").length,
  };
}

export async function getAdminMfaRecoveryCandidates(
  excludeUserId?: string,
): Promise<AdminMfaRecoveryCandidate[]> {
  const supabaseAdmin = createSupabaseAdminClient();
  const query = supabaseAdmin
    .from("admin_users")
    .select("user_id, email, role")
    .order("role", { ascending: true })
    .order("email", { ascending: true });

  if (excludeUserId) {
    query.neq("user_id", excludeUserId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as AdminProfileRow[]).map((candidate) => ({
    displayName: getUserDisplayName(candidate),
    email: candidate.email,
    role: candidate.role,
    userId: candidate.user_id,
  }));
}

export async function writeAdminMfaEvent({
  action,
  activityAction,
  actorAdmin,
  actorUser,
  description,
  factorId,
  metadata,
  relatedUserId,
  result = "Success",
  targetAdmin,
}: AdminMfaEventInput) {
  const supabaseAdmin = createSupabaseAdminClient();
  const occurredAt = new Date().toISOString();
  const performedBy = buildPerformedBy(actorAdmin, actorUser);
  const resourceId = factorId ?? relatedUserId ?? actorUser.id;
  const mergedMetadata = {
    ...(metadata ?? {}),
    factor_id: factorId ?? null,
    target_admin_user_id: targetAdmin?.user_id ?? relatedUserId ?? null,
    target_admin_role: targetAdmin?.role ?? null,
  };

  try {
    await writeUserActivity(supabaseAdmin, {
      user_id: relatedUserId ?? actorUser.id,
      actor_user_id: actorUser.id,
      action: activityAction,
      description,
      metadata: mergedMetadata,
      occurred_at: occurredAt,
      related_entity_id: resourceId,
      related_entity_type: factorId ? "mfa_factor" : "admin_user",
      source: "admin_access",
    });
  } catch (error) {
    console.warn("Admin MFA activity write failed:", error);
  }

  const { error: auditError } = await supabaseAdmin.from("audit_log").insert({
    action,
    result,
    performed_by: performedBy,
    affected_entity: {
      type: factorId ? "mfa_factor" : "admin_user",
      id: resourceId,
      name: targetAdmin?.email ?? actorAdmin.email,
    },
    metadata: mergedMetadata,
    resource_id: resourceId,
    timestamp: occurredAt,
  });

  if (auditError) {
    throw new Error(auditError.message);
  }
}

export async function recordAdminMfaEnrollment(
  factorId: string,
  metadata?: Record<string, unknown>,
) {
  const context = await getAdminMfaContext();

  if (!context.user || !context.adminUser) {
    throw new Error("Authentication required.");
  }

  const factors = await listManagedFactorsForUser(context.user.id);
  const factor = factors.find((candidate) => candidate.id === factorId);

  if (!factor || factor.status !== "verified") {
    throw new Error("Verified MFA factor not found.");
  }

  await writeAdminMfaEvent({
    action: ADMIN_MFA_ENROLLED_AUDIT_ACTION,
    activityAction: ADMIN_MFA_ENROLLED_ACTIVITY_ACTION,
    actorAdmin: context.adminUser,
    actorUser: context.user,
    description: `${context.adminUser.email} enrolled an MFA factor.`,
    factorId: factor.id,
    metadata: {
      factor_type: factor.factorType,
      friendly_name: factor.friendlyName,
      ...metadata,
    },
  });
}

export async function recordAdminMfaChallengeResult(input: {
  factorId?: string;
  message?: string;
  success: boolean;
}) {
  const context = await getAdminMfaContext();

  if (!context.user || !context.adminUser) {
    return;
  }

  await writeAdminMfaEvent({
    action: ADMIN_MFA_CHALLENGE_AUDIT_ACTION,
    activityAction: ADMIN_MFA_CHALLENGE_ACTIVITY_ACTION,
    actorAdmin: context.adminUser,
    actorUser: context.user,
    description: input.success
      ? `${context.adminUser.email} completed an MFA challenge.`
      : `${context.adminUser.email} failed an MFA challenge.`,
    factorId: input.factorId ?? null,
    metadata: {
      message: input.message ?? null,
      success: input.success,
    },
    result: input.success ? "Success" : "Failed",
  });
}
