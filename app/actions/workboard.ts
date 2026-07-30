"use server";

import { z } from "zod";

import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  acceptWorkboardInvitation,
  issueWorkboardInvitation,
  listWorkboardInvitations,
  resendWorkboardInvitation,
  revokeWorkboardInvitation,
} from "@/features/invitations/application/workboard/workboardInvitationAdapter";

const roleSchema = z.enum(["owner", "admin", "editor", "viewer"]);
const workboardWriteRoles = new Set(["owner", "admin", "editor"]);
const workboardAdminRoles = new Set(["owner", "admin"]);
const workboardReadableRoles = new Set(["owner", "admin", "editor", "viewer"]);

const requireWorkboardMembership = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  teamId: string,
  userId: string,
) => {
  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !workboardReadableRoles.has(membership.role)) {
    throw new Error("Not authorized to access this team");
  }

  return membership;
};

export type WorkboardBootstrap = {
  teamId: string;
  teamName: string;
  role: "owner" | "admin" | "editor" | "viewer";
};

export async function bootstrapWorkboardTeam(): Promise<WorkboardBootstrap> {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const { data: existingMember } = await supabase
    .from("workboard_team_members")
    .select("team_id, role, status")
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (existingMember?.team_id) {
    const { data: team } = await supabase
      .from("workboard_teams")
      .select("id, name")
      .eq("id", existingMember.team_id)
      .maybeSingle();

    return {
      teamId: existingMember.team_id,
      teamName: team?.name ?? "MOVRR HQ",
      role: existingMember.role as WorkboardBootstrap["role"],
    };
  }

  const { data: existingTeam } = await supabase
    .from("workboard_teams")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingTeam?.id) {
    throw new Error("Not authorized to access this workboard team");
  }

  if (!["super_admin", "admin"].includes(auth.adminUser.role)) {
    throw new Error("Not authorized to bootstrap a workboard team");
  }

  const { data: newTeam, error: teamError } = await supabase
    .from("workboard_teams")
    .insert({
      name: "MOVRR HQ",
      created_by: auth.authUser.id,
    })
    .select("id, name")
    .single();

  if (teamError || !newTeam) {
    throw new Error(teamError?.message || "Failed to create workboard team");
  }

  await supabase.from("workboard_team_members").insert({
    team_id: newTeam.id,
    user_id: auth.authUser.id,
    role: "owner",
    status: "active",
  });

  return {
    teamId: newTeam.id,
    teamName: newTeam.name,
    role: "owner",
  };
}

export async function getWorkboardMembers(teamId: string) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  await requireWorkboardMembership(supabase, teamId, auth.authUser.id);

  const { data: members = [] } = await supabase
    .from("workboard_team_members")
    .select("id, team_id, user_id, role, status, created_at")
    .eq("team_id", teamId)
    .eq("status", "active");

  const userIds = members?.map((member) => member.user_id).filter(Boolean);

  const { data: adminUsers = [] } = await supabase
    .from("admin_users")
    .select("user_id, email, role")
    .in(
      "user_id",
      userIds?.length ? userIds : ["00000000-0000-0000-0000-000000000000"],
    );

  const emailLookup = new Map(
    adminUsers?.map((user) => [user.user_id, user.email]),
  );

  return members?.map((member) => ({
    ...member,
    email: emailLookup.get(member.user_id) ?? "",
  }));
}

export async function getWorkboardBoards(teamId: string) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  await requireWorkboardMembership(supabase, teamId, auth.authUser.id);

  const { data: boards = [] } = await supabase
    .from("workboard_boards")
    .select("*")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  return boards;
}

export async function getWorkboardCards(teamId: string) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  await requireWorkboardMembership(supabase, teamId, auth.authUser.id);

  const { data: cards = [] } = await supabase
    .from("workboard_cards")
    .select("*")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  return cards;
}

export async function inviteWorkboardMember(input: {
  teamId: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({
      teamId: z.string().uuid(),
      email: z.string().email(),
      role: roleSchema,
    })
    .parse(input);

  const membership = await requireWorkboardMembership(
    supabase,
    payload.teamId,
    auth.authUser.id,
  );

  const result = await issueWorkboardInvitation({
    teamId: payload.teamId,
    email: payload.email,
    role: payload.role,
    invitedByUserId: auth.authUser.id,
    invitedByEmail: auth.adminUser.email,
    actorWorkboardRole: membership.role,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  return {
    success: true as const,
    invitationId: result.value.invitationId,
    emailSent: result.value.emailSent,
    expiresAt: result.value.expiresAt,
  };
}

export async function listWorkboardInvites(teamId: string) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();
  const payload = z.string().uuid().parse(teamId);

  const membership = await requireWorkboardMembership(
    supabase,
    payload,
    auth.authUser.id,
  );
  if (!workboardAdminRoles.has(membership.role)) {
    throw new Error("Not authorized to view invitations");
  }

  const result = await listWorkboardInvitations(payload);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.value;
}

export async function revokeWorkboardInvite(input: {
  teamId: string;
  invitationId: string;
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();
  const payload = z
    .object({
      teamId: z.string().uuid(),
      invitationId: z.string().uuid(),
    })
    .parse(input);

  const membership = await requireWorkboardMembership(
    supabase,
    payload.teamId,
    auth.authUser.id,
  );
  if (!workboardAdminRoles.has(membership.role)) {
    throw new Error("Not authorized to revoke invitations");
  }

  const result = await revokeWorkboardInvitation({
    invitationId: payload.invitationId,
    teamId: payload.teamId,
    revokedByUserId: auth.authUser.id,
    revokedByEmail: auth.adminUser.email,
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return { success: true as const };
}

export async function resendWorkboardInvite(input: {
  teamId: string;
  invitationId: string;
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();
  const payload = z
    .object({
      teamId: z.string().uuid(),
      invitationId: z.string().uuid(),
    })
    .parse(input);

  const membership = await requireWorkboardMembership(
    supabase,
    payload.teamId,
    auth.authUser.id,
  );
  if (!workboardAdminRoles.has(membership.role)) {
    throw new Error("Not authorized to resend invitations");
  }

  const result = await resendWorkboardInvitation({
    invitationId: payload.invitationId,
    teamId: payload.teamId,
    invitedByUserId: auth.authUser.id,
    invitedByEmail: auth.adminUser.email,
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return {
    success: true as const,
    invitationId: result.value.invitationId,
    emailSent: result.value.emailSent,
  };
}

/**
 * Typed accept outcomes for the invite page. Never reports success unless
 * membership is confirmed by the transactional accept RPC.
 */
export type AcceptWorkboardInviteResult =
  | {
      success: true;
      status: "accepted" | "already_accepted";
      teamId: string;
      membershipId: string;
      role: string;
    }
  | {
      success: false;
      code: string;
      message: string;
    };

export async function acceptWorkboardInvite(
  token: string,
): Promise<AcceptWorkboardInviteResult> {
  const auth = await requireCapability("workboard.access", { mutation: true });

  if (!token?.trim()) {
    return {
      success: false,
      code: "missing_token",
      message: "Invite link is missing a token. Use the link from your email.",
    };
  }

  const result = await acceptWorkboardInvitation({
    plaintextToken: token,
    userId: auth.authUser.id,
    email: auth.adminUser.email,
  });

  if (!result.ok) {
    return {
      success: false,
      code: result.kind,
      message: result.message,
    };
  }

  return {
    success: true,
    status: result.value.status === "already_accepted"
      ? "already_accepted"
      : "accepted",
    teamId: result.value.teamId,
    membershipId: result.value.membershipId,
    role: result.value.role,
  };
}

export async function updateWorkboardMemberRole(input: {
  memberId: string;
  role: "owner" | "admin" | "editor" | "viewer";
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();
  const payload = z
    .object({ memberId: z.string().uuid(), role: roleSchema })
    .parse(input);

  const { data: targetMember, error: targetMemberError } = await supabase
    .from("workboard_team_members")
    .select("team_id, role")
    .eq("id", payload.memberId)
    .eq("status", "active")
    .maybeSingle();

  if (targetMemberError || !targetMember) {
    throw new Error(targetMemberError?.message || "Member not found");
  }

  const { data: actorMembership } = await supabase
    .from("workboard_team_members")
    .select("role")
    .eq("team_id", targetMember.team_id)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!actorMembership || !workboardAdminRoles.has(actorMembership.role)) {
    throw new Error("Not authorized to update member roles");
  }

  if (payload.role === "owner" && actorMembership.role !== "owner") {
    throw new Error("Only owners can assign owner role");
  }

  if (targetMember.role === "owner" && actorMembership.role !== "owner") {
    throw new Error("Only owners can change owner roles");
  }

  const { error } = await supabase
    .from("workboard_team_members")
    .update({ role: payload.role, updated_at: new Date().toISOString() })
    .eq("id", payload.memberId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function removeWorkboardMember(memberId: string) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const { data: targetMember, error: targetMemberError } = await supabase
    .from("workboard_team_members")
    .select("team_id, role")
    .eq("id", memberId)
    .eq("status", "active")
    .maybeSingle();

  if (targetMemberError || !targetMember) {
    throw new Error(targetMemberError?.message || "Member not found");
  }

  const { data: actorMembership } = await supabase
    .from("workboard_team_members")
    .select("role")
    .eq("team_id", targetMember.team_id)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!actorMembership || !workboardAdminRoles.has(actorMembership.role)) {
    throw new Error("Not authorized to remove members");
  }

  if (targetMember.role === "owner" && actorMembership.role !== "owner") {
    throw new Error("Only owners can remove owners");
  }

  const { error } = await supabase
    .from("workboard_team_members")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function createWorkboardBoard(input: {
  teamId: string;
  title: string;
  helper?: string | null;
  tone: "slate" | "indigo" | "emerald" | "amber";
  statusKey: string;
  position: number;
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({
      teamId: z.string().uuid(),
      title: z.string().min(1),
      helper: z.string().nullable().optional(),
      tone: z.enum(["slate", "indigo", "emerald", "amber"]),
      statusKey: z.string().min(1),
      position: z.number().int().min(0),
    })
    .parse(input);

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", payload.teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    throw new Error("Not authorized to create boards");
  } else if (!workboardWriteRoles.has(membership.role)) {
    throw new Error("Not authorized to create boards");
  }

  const { data: board, error } = await supabase
    .from("workboard_boards")
    .insert({
      team_id: payload.teamId,
      title: payload.title,
      helper: payload.helper ?? null,
      tone: payload.tone,
      status_key: payload.statusKey,
      position: payload.position,
      created_by: auth.authUser.id,
      updated_by: auth.authUser.id,
    })
    .select("id")
    .single();

  if (error || !board) {
    throw new Error(error?.message || "Failed to create board");
  }

  return { success: true, id: board.id };
}

export async function createWorkboardCard(input: {
  teamId: string;
  boardId: string;
  title: string;
  description?: string | null;
  type: "Engineering" | "Operations" | "Campaign" | "Product" | "Growth";
  priority: "Low" | "Medium" | "High" | "Critical";
  dueDate?: string | null;
  effort?: string | null;
  position: number;
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({
      teamId: z.string().uuid(),
      boardId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().nullable().optional(),
      type: z.enum([
        "Engineering",
        "Operations",
        "Campaign",
        "Product",
        "Growth",
      ]),
      priority: z.enum(["Low", "Medium", "High", "Critical"]),
      dueDate: z.string().nullable().optional(),
      effort: z.string().nullable().optional(),
      position: z.number().int().min(0),
    })
    .parse(input);

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", payload.teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    throw new Error("Not authorized to create cards");
  } else if (!workboardWriteRoles.has(membership.role)) {
    throw new Error("Not authorized to create cards");
  }

  const { data: card, error } = await supabase
    .from("workboard_cards")
    .insert({
      team_id: payload.teamId,
      board_id: payload.boardId,
      title: payload.title,
      description: payload.description ?? null,
      type: payload.type,
      priority: payload.priority,
      due_date: payload.dueDate ?? null,
      effort: payload.effort ?? null,
      position: payload.position,
      created_by: auth.authUser.id,
      updated_by: auth.authUser.id,
    })
    .select("id")
    .single();

  if (error || !card) {
    throw new Error(error?.message || "Failed to create card");
  }

  return { success: true, id: card.id };
}

export async function updateWorkboardBoard(input: {
  teamId: string;
  boardId: string;
  title: string;
  helper?: string | null;
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({
      teamId: z.string().uuid(),
      boardId: z.string().uuid(),
      title: z.string().min(1),
      helper: z.string().nullable().optional(),
    })
    .parse(input);

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", payload.teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Not authorized to update boards");
  }

  const { error } = await supabase
    .from("workboard_boards")
    .update({
      title: payload.title,
      helper: payload.helper ?? null,
      updated_by: auth.authUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.boardId)
    .eq("team_id", payload.teamId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function archiveWorkboardBoard(input: {
  teamId: string;
  boardId: string;
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({ teamId: z.string().uuid(), boardId: z.string().uuid() })
    .parse(input);

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", payload.teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Not authorized to archive boards");
  }

  const { error } = await supabase
    .from("workboard_boards")
    .update({
      archived_at: new Date().toISOString(),
      updated_by: auth.authUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.boardId)
    .eq("team_id", payload.teamId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function updateWorkboardBoardOrder(input: {
  teamId: string;
  boards: { id: string; position: number }[];
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({
      teamId: z.string().uuid(),
      boards: z
        .array(
          z.object({
            id: z.string().uuid(),
            position: z.number().int().min(0),
          }),
        )
        .min(1),
    })
    .parse(input);

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", payload.teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Not authorized to reorder boards");
  }

  const updates = payload.boards.map((board) =>
    supabase
      .from("workboard_boards")
      .update({
        position: board.position,
        updated_by: auth.authUser.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", board.id)
      .eq("team_id", payload.teamId),
  );

  const results = await Promise.all(updates);
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  return { success: true };
}

export async function updateWorkboardCard(input: {
  teamId: string;
  cardId: string;
  title: string;
  description?: string | null;
  type: "Engineering" | "Operations" | "Campaign" | "Product" | "Growth";
  priority: "Low" | "Medium" | "High" | "Critical";
  dueDate?: string | null;
  effort?: string | null;
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({
      teamId: z.string().uuid(),
      cardId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().nullable().optional(),
      type: z.enum([
        "Engineering",
        "Operations",
        "Campaign",
        "Product",
        "Growth",
      ]),
      priority: z.enum(["Low", "Medium", "High", "Critical"]),
      dueDate: z.string().nullable().optional(),
      effort: z.string().nullable().optional(),
    })
    .parse(input);

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", payload.teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin", "editor"].includes(membership.role)) {
    throw new Error("Not authorized to update cards");
  }

  const { error } = await supabase
    .from("workboard_cards")
    .update({
      title: payload.title,
      description: payload.description ?? null,
      type: payload.type,
      priority: payload.priority,
      due_date: payload.dueDate ?? null,
      effort: payload.effort ?? null,
      updated_by: auth.authUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.cardId)
    .eq("team_id", payload.teamId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function updateWorkboardCardPositions(input: {
  teamId: string;
  updates: { id: string; boardId: string; position: number }[];
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({
      teamId: z.string().uuid(),
      updates: z
        .array(
          z.object({
            id: z.string().uuid(),
            boardId: z.string().uuid(),
            position: z.number().int().min(0),
          }),
        )
        .min(1),
    })
    .parse(input);

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", payload.teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin", "editor"].includes(membership.role)) {
    throw new Error("Not authorized to reorder cards");
  }

  const updates = payload.updates.map((update) =>
    supabase
      .from("workboard_cards")
      .update({
        position: update.position,
        board_id: update.boardId,
        updated_by: auth.authUser.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id)
      .eq("team_id", payload.teamId),
  );

  const results = await Promise.all(updates);
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  return { success: true };
}

export async function archiveWorkboardCard(input: {
  teamId: string;
  cardId: string;
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({ teamId: z.string().uuid(), cardId: z.string().uuid() })
    .parse(input);

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", payload.teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin", "editor"].includes(membership.role)) {
    throw new Error("Not authorized to archive cards");
  }

  const { error } = await supabase
    .from("workboard_cards")
    .update({
      archived_at: new Date().toISOString(),
      updated_by: auth.authUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.cardId)
    .eq("team_id", payload.teamId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function deleteWorkboardCard(input: {
  teamId: string;
  cardId: string;
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({ teamId: z.string().uuid(), cardId: z.string().uuid() })
    .parse(input);

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", payload.teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Not authorized to delete cards");
  }

  const { error } = await supabase
    .from("workboard_cards")
    .delete()
    .eq("id", payload.cardId)
    .eq("team_id", payload.teamId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function deleteWorkboardBoard(input: {
  teamId: string;
  boardId: string;
}) {
  const auth = await requireCapability("workboard.access", { mutation: true });
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({ teamId: z.string().uuid(), boardId: z.string().uuid() })
    .parse(input);

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id, role")
    .eq("team_id", payload.teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Not authorized to delete boards");
  }

  const { error } = await supabase
    .from("workboard_boards")
    .delete()
    .eq("id", payload.boardId)
    .eq("team_id", payload.teamId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}
