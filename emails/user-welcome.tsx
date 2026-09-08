import {
  BaseEmail,
  DataRow,
  DataTable,
  SupportingText,
} from "./_components/base-email";

interface UserWelcomeEmailProps {
  name: string;
  role: string;
  dashboardUrl: string;
  id?: string;
  locale?: string;
}

export default function UserWelcomeEmail({
  name = "Ada",
  role = "admin",
  dashboardUrl = "https://admin.movrr.nl",
  id = "preview-invite",
  locale = "en-US",
}: UserWelcomeEmailProps = { name: "Ada", role: "admin", dashboardUrl: "https://admin.movrr.nl", id: "preview-invite" }) {
  return (
    <BaseEmail
      locale={locale}
      contextLabel="MOVRR Admin"
      previewText="Your MOVRR Admin access is ready."
      title={`Welcome, ${name}`}
      intro="Your MOVRR Admin account has been created. Use the secure link below to access the dashboard and set your password."
      actionLabel="Open MOVRR Admin"
      actionUrl={dashboardUrl}
      footerNote="You received this transactional email because MOVRR Admin access was granted to you."
    >
      <DataTable>
        <DataRow label="Role" value={role} />
        {id ? <DataRow label="Invite ID" value={id} /> : null}
      </DataTable>
      <SupportingText>
        If you did not expect this email, contact your administrator immediately.
      </SupportingText>
    </BaseEmail>
  );
}

UserWelcomeEmail.PreviewProps = {
  name: "Ada",
  role: "admin",
  dashboardUrl: "https://admin.movrr.nl",
  id: "preview-invite",
} satisfies UserWelcomeEmailProps;

export function userWelcomeText({
  name,
  role,
  dashboardUrl,
  id,
}: UserWelcomeEmailProps) {
  const lines = [`Welcome to MOVRR Admin, ${name}`, "", `Role: ${role}`];
  if (id) lines.push(`Invite ID: ${id}`);
  lines.push(
    "",
    `Open MOVRR Admin: ${dashboardUrl}`,
    "",
    "If you did not expect this email, contact your administrator immediately.",
  );
  return lines.join("\n");
}
