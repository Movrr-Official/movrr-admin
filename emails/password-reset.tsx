import {
  BaseEmail,
  Paragraph,
  SupportingText,
} from "./_components/base-email";

interface PasswordResetEmailProps {
  name: string;
  resetUrl: string;
  locale?: string;
}

export default function PasswordResetEmail({
  name,
  resetUrl,
  locale = "en-US",
}: PasswordResetEmailProps) {
  return (
    <BaseEmail
      locale={locale}
      contextLabel="MOVRR Admin"
      previewText="Use this secure link to reset your MOVRR Admin password."
      title={`Reset your password, ${name}`}
      intro="We received a request to reset the password for your MOVRR Admin account."
      actionLabel="Reset password"
      actionUrl={resetUrl}
      actionAriaLabel="Reset your MOVRR Admin password"
      footerNote="This is a transactional security email from MOVRR Admin."
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

export function passwordResetText({ name, resetUrl }: PasswordResetEmailProps) {
  return [
    `Reset your MOVRR Admin password, ${name}`,
    "",
    "We received a request to reset the password for your MOVRR Admin account.",
    "",
    `Reset password: ${resetUrl}`,
    "",
    "This link expires according to the current security policy.",
    "If you did not request this reset, you can safely ignore this email.",
  ].join("\n");
}
