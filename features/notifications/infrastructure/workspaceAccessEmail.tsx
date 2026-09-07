import "server-only";

import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { CUSTOMER_APP_URL, RESEND_API_KEY, SYSTEM_EMAIL } from "@/lib/env";
import WorkspaceAccessEmail, {
  workspaceAccessSubject,
  workspaceAccessText,
} from "@/emails/workspace-access";
import type { MembershipRole } from "@/features/organisations/domain/CapabilityCatalog";

export async function sendWorkspaceAccessEmail(input: {
  change: "access_granted" | "role_changed";
  organisationId: string;
  userId: string;
  membershipId: string;
  role: MembershipRole;
  version: string;
}): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    const [{ data: user, error: userError }, { data: organisation, error: orgError }] =
      await Promise.all([
        supabase.from("user").select("email, name").eq("id", input.userId).maybeSingle(),
        supabase.from("organisation").select("name").eq("id", input.organisationId).maybeSingle(),
      ]);
    if (userError) throw new Error(userError.message);
    if (orgError) throw new Error(orgError.message);
    if (!user?.email || !organisation?.name) return;

    const props = {
      change: input.change,
      name: user.name ? String(user.name) : undefined,
      organisationName: String(organisation.name),
      role: input.role.charAt(0).toUpperCase() + input.role.slice(1),
      actionUrl: `${CUSTOMER_APP_URL.replace(/\/$/, "")}/dashboard`,
    } as const;
    const resend = new Resend(RESEND_API_KEY);
    const { error } = await resend.emails.send(
      {
        from: `MOVRR <${SYSTEM_EMAIL}>`,
        to: [String(user.email)],
        subject: workspaceAccessSubject(props),
        react: <WorkspaceAccessEmail {...props} />,
        text: workspaceAccessText(props),
        tags: [
          { name: "category", value: "workspace-security" },
          { name: "event", value: input.change.replaceAll("_", "-") },
        ],
      },
      {
        idempotencyKey: `workspace:${input.membershipId}:${input.change}:${input.version}`.slice(0, 256),
      },
    );
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("Workspace access email failed", {
      membershipId: input.membershipId,
      change: input.change,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
