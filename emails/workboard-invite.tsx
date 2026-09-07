import {
  BaseEmail,
  DataRow,
  DataTable,
  Paragraph,
  SupportingText,
} from "./_components/base-email";

interface WorkboardInviteEmailProps {
  inviteUrl: string;
  role: string;
  expiresAt: string;
  locale?: string;
}

function formatExpiry(expiresAt: string) {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return expiresAt;
  return `${date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })} at ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

export default function WorkboardInviteEmail({
  inviteUrl,
  role,
  expiresAt,
  locale = "en-US",
}: WorkboardInviteEmailProps) {
  const expiresLabel = formatExpiry(expiresAt);

  return (
    <BaseEmail
      locale={locale}
      contextLabel="MOVRR Workboard"
      previewText="Accept your invitation to the MOVRR Workboard."
      title="You’re invited to the Workboard"
      intro={
        <>
          You have been invited to join the MOVRR Workboard as <strong>{role}</strong>.
        </>
      }
      actionLabel="Accept invitation"
      actionUrl={inviteUrl}
      footerNote="You received this transactional email because a MOVRR Workboard invitation was issued to your address."
    >
      <DataTable>
        <DataRow label="Role" value={role} />
        <DataRow label="Expires" value={expiresLabel} />
      </DataTable>
      <Paragraph>
        This invitation is for an existing MOVRR admin platform user (admin,
        super admin, or moderator). Sign in with the email address that received
        this invitation.
      </Paragraph>
      <SupportingText>
        If you are signed in with a different account, sign out before opening
        the invitation link.
      </SupportingText>
    </BaseEmail>
  );
}

export function workboardInviteText({
  inviteUrl,
  role,
  expiresAt,
}: WorkboardInviteEmailProps) {
  return [
    "You’re invited to the MOVRR Workboard",
    "",
    `Role: ${role}`,
    `Expires: ${formatExpiry(expiresAt)}`,
    "",
    `Accept invitation: ${inviteUrl}`,
    "",
    "This invitation is for an existing MOVRR admin platform user (admin, super admin, or moderator). Sign in with the email address that received this invitation.",
    "If you are signed in with a different account, sign out before opening the invitation link.",
  ].join("\n");
}
