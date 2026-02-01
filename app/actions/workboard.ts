"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { NEXT_PUBLIC_APP_URL, RESEND_API_KEY, FROM_EMAIL } from "@/lib/env";
import { Resend } from "resend";

const roleSchema = z.enum(["owner", "admin", "editor", "viewer"]);

export type WorkboardBootstrap = {
  teamId: string;
  teamName: string;
  role: "owner" | "admin" | "editor" | "viewer";
};

export async function bootstrapWorkboardTeam(): Promise<WorkboardBootstrap> {
  const auth = await requireAdmin();
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
  const auth = await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    await supabase.from("workboard_team_members").upsert({
      team_id: teamId,
      user_id: auth.authUser.id,
      role: "owner",
      status: "active",
    });
  }

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
  const auth = await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    await supabase.from("workboard_team_members").upsert({
      team_id: teamId,
      user_id: auth.authUser.id,
      role: "owner",
      status: "active",
    });
  }

  const { data: boards = [] } = await supabase
    .from("workboard_boards")
    .select("*")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  return boards;
}

export async function getWorkboardCards(teamId: string) {
  const auth = await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const { data: membership } = await supabase
    .from("workboard_team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", auth.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    await supabase.from("workboard_team_members").upsert({
      team_id: teamId,
      user_id: auth.authUser.id,
      role: "owner",
      status: "active",
    });
  }

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
  const auth = await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const payload = z
    .object({
      teamId: z.string().uuid(),
      email: z.string().email(),
      role: roleSchema,
    })
    .parse(input);

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const { data: invite, error } = await supabase
    .from("workboard_invites")
    .insert({
      team_id: payload.teamId,
      email: payload.email.toLowerCase(),
      role: payload.role,
      token,
      invited_by: auth.authUser.id,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, token")
    .single();

  if (error || !invite) {
    throw new Error(error?.message || "Failed to create invite");
  }

  if (RESEND_API_KEY) {
    const resend = new Resend(RESEND_API_KEY);
    const inviteLink = `${NEXT_PUBLIC_APP_URL}/workboard/invite?token=${invite.token}`;

    await resend.emails.send({
      from: FROM_EMAIL ? `Movrr <${FROM_EMAIL}>` : "Movrr <no-reply@movrr.nl>",
      to: payload.email,
      subject: "You have been invited to the MOVRR Workboard",
      html: `<p>You have been invited to join the MOVRR Workboard.</p><p><a href="${inviteLink}">Accept invite</a></p>`,
    });
  }

  return { success: true, token: invite.token };
}

export async function acceptWorkboardInvite(token: string) {
  const auth = await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const { data: invite, error } = await supabase
    .from("workboard_invites")
    .select("id, team_id, role, accepted_at, expires_at, email")
    .eq("token", token)
    .maybeSingle();

  if (error || !invite) {
    throw new Error("Invite not found");
  }
  if (invite.accepted_at) {
    return { success: true, status: "already_accepted" } as const;
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error("Invite expired");
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("email")
    .eq("user_id", auth.authUser.id)
    .maybeSingle();

  if (!adminUser?.email) {
    throw new Error("User email not found");
  }

  if (adminUser.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new Error("Invite email does not match current user");
  }

  await supabase.from("workboard_team_members").upsert({
    team_id: invite.team_id,
    user_id: auth.authUser.id,
    role: invite.role,
    status: "active",
  });

  await supabase
    .from("workboard_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return { success: true, status: "accepted" } as const;
}

export async function updateWorkboardMemberRole(input: {
  memberId: string;
  role: "owner" | "admin" | "editor" | "viewer";
}) {
  const supabase = createSupabaseAdminClient();
  const payload = z
    .object({ memberId: z.string().uuid(), role: roleSchema })
    .parse(input);

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
  const supabase = createSupabaseAdminClient();
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
  const auth = await requireAdmin();
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
    await supabase.from("workboard_team_members").upsert({
      team_id: payload.teamId,
      user_id: auth.authUser.id,
      role: "owner",
      status: "active",
    });
  } else if (!roleSchema.safeParse(membership.role).success) {
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
  const auth = await requireAdmin();
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
    await supabase.from("workboard_team_members").upsert({
      team_id: payload.teamId,
      user_id: auth.authUser.id,
      role: "owner",
      status: "active",
    });
  } else if (!roleSchema.safeParse(membership.role).success) {
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

export async function deleteWorkboardBoard(input: {
  teamId: string;
  boardId: string;
}) {
  const auth = await requireAdmin();
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
