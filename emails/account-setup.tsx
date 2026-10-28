import {
  BaseEmail,
  Paragraph,
  SupportingText,
} from "./_components/base-email";
import { Link } from "@react-email/components";

interface AccountSetupEmailProps {
  name: string;
  setupUrl: string;
  locale?: string;
  organisationName?: string;
  acceptanceUrl?: string;
  invitationExpiresAt?: string;
  supportEmail?: string;
  setupExpiryMinutes?: number;
}

export default function AccountSetupEmail({
  name = "Ada",
  setupUrl = "https://admin.movrr.nl/setup?token=preview",
  locale = "en-US",
  organisationName,
  acceptanceUrl,
  invitationExpiresAt,
  supportEmail = "support@movrr.nl",
  setupExpiryMinutes,
}: AccountSetupEmailProps = { name: "Ada", setupUrl: "https://admin.movrr.nl/setup?token=preview" }) {
  return (
    <BaseEmail
      locale={locale}
      contextLabel="Secure account access"
      previewText="Create your password and finish setting up your MOVRR account."
      title={`Set up your account, ${name}`}
      intro={organisationName ? `Your MOVRR account has access for ${organisationName}. Use this secure link to set a password if needed, then sign in. Your organisation role is unchanged.` : "Your MOVRR account is ready. Create your password to complete setup and sign in for the first time."}
      actionLabel="Set up account"
      actionUrl={setupUrl}
      actionAriaLabel="Set up your MOVRR account"
      footerNote="You received this transactional email because MOVRR account access was requested for you."
    >
      <Paragraph>
        For your security, {setupExpiryMinutes ? `this setup link expires within ${setupExpiryMinutes} minutes under MOVRR Auth policy` : "this link expires according to the current security policy"}, can be used only once, and can only be used for this account. Requesting this email does not change your current password.
      </Paragraph>
      {acceptanceUrl && <Paragraph>After signing in with this email address, <Link href={acceptanceUrl}>accept your organisation invitation</Link>.
        {invitationExpiresAt && ` The organisation invitation expires at ${new Date(invitationExpiresAt).toUTCString()}. Previous invitation links are superseded.`}
      </Paragraph>}
      <SupportingText>
        If you were not expecting this invitation, you can ignore this email. For help, contact {supportEmail}.
      </SupportingText>
    </BaseEmail>
  );
}

AccountSetupEmail.PreviewProps = {
  name: "Ada",
  setupUrl: "https://admin.movrr.nl/setup?token=preview",
} satisfies AccountSetupEmailProps;

export function accountSetupText({ name, setupUrl, organisationName, acceptanceUrl, invitationExpiresAt, supportEmail = "support@movrr.nl", setupExpiryMinutes }: AccountSetupEmailProps) {
  return [
    `Set up your MOVRR account, ${name}`,
    "",
    "Your MOVRR account is ready. Create your password to complete setup and sign in for the first time.",
    "",
    `Set up account: ${setupUrl}`,
    ...(organisationName ? [`Organisation: ${organisationName}. Your role is unchanged.`] : []),
    ...(acceptanceUrl ? [`After signing in with this email address, accept your organisation invitation: ${acceptanceUrl}`,
      `Organisation invitation expires: ${new Date(invitationExpiresAt!).toUTCString()}. Previous invitation links are superseded.`] : []),
    "",
    "For your security, this single-use setup link expires according to MOVRR Auth policy and can only be used for this account. Your current password is unchanged until you choose a new one.",
    ...(setupExpiryMinutes ? [`The setup link expires within ${setupExpiryMinutes} minutes.`] : []),
    `If you were not expecting this invitation, you can ignore this email. For help, contact ${supportEmail}.`,
  ].join("\n");
}
