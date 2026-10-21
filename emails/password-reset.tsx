import {
  BaseEmail,
  Paragraph,
  SupportingText,
} from "./_components/base-email";

interface PasswordResetEmailProps {
  name: string;
  resetUrl: string;
  locale?: string;
  accountLabel?: string;
}

export default function PasswordResetEmail({
  name = "Ada",
  resetUrl = "https://admin.movrr.nl/reset?token=preview",
  locale = "en-US",
  accountLabel = "MOVRR Admin",
}: PasswordResetEmailProps = { name: "Ada", resetUrl: "https://admin.movrr.nl/reset?token=preview" }) {
  return (
    <BaseEmail
      locale={locale}
      contextLabel={accountLabel}
      previewText={`Use this secure link to reset your ${accountLabel} password.`}
      title={`Reset your password, ${name}`}
      intro={`We received a request to reset the password for your ${accountLabel} account.`}
      actionLabel="Reset password"
      actionUrl={resetUrl}
      actionAriaLabel={`Reset your ${accountLabel} password`}
      footerNote={`This is a transactional security email from ${accountLabel}.`}
    >
      <Paragraph>
        This link expires according to the current security policy. After you
        reset your password, use the new password the next time you sign in.
      </Paragraph>
      <SupportingText>
        If you did not request this reset, you can safely ignore this email.
      </SupportingText>
    </BaseEmail>
  );
}

PasswordResetEmail.PreviewProps = {
  name: "Ada",
  resetUrl: "https://admin.movrr.nl/reset?token=preview",
} satisfies PasswordResetEmailProps;

export function passwordResetText({ name, resetUrl, accountLabel = "MOVRR Admin" }: PasswordResetEmailProps) {
  return [
    `Reset your ${accountLabel} password, ${name}`,
    "",
    `We received a request to reset the password for your ${accountLabel} account.`,
    "",
    `Reset password: ${resetUrl}`,
    "",
    "This link expires according to the current security policy.",
    "If you did not request this reset, you can safely ignore this email.",
  ].join("\n");
}
