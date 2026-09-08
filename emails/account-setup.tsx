import {
  BaseEmail,
  Paragraph,
  SupportingText,
} from "./_components/base-email";

interface AccountSetupEmailProps {
  name: string;
  setupUrl: string;
  locale?: string;
}

export default function AccountSetupEmail({
  name = "Ada",
  setupUrl = "https://admin.movrr.nl/setup?token=preview",
  locale = "en-US",
}: AccountSetupEmailProps = { name: "Ada", setupUrl: "https://admin.movrr.nl/setup?token=preview" }) {
  return (
    <BaseEmail
      locale={locale}
      contextLabel="Secure account access"
      previewText="Create your password and finish setting up your MOVRR account."
      title={`Set up your account, ${name}`}
      intro="Your MOVRR account is ready. Create your password to complete setup and sign in for the first time."
      actionLabel="Set up account"
      actionUrl={setupUrl}
      actionAriaLabel="Set up your MOVRR account"
      footerNote="You received this transactional email because a MOVRR account was created for you."
    >
      <Paragraph>
        For your security, this link expires according to the current security
        policy and can only be used for this account.
      </Paragraph>
      <SupportingText>
        If you were not expecting this invitation, you can ignore this email.
      </SupportingText>
    </BaseEmail>
  );
}

AccountSetupEmail.PreviewProps = {
  name: "Ada",
  setupUrl: "https://admin.movrr.nl/setup?token=preview",
} satisfies AccountSetupEmailProps;

export function accountSetupText({ name, setupUrl }: AccountSetupEmailProps) {
  return [
    `Set up your MOVRR account, ${name}`,
    "",
    "Your MOVRR account is ready. Create your password to complete setup and sign in for the first time.",
    "",
    `Set up account: ${setupUrl}`,
    "",
    "For your security, this link expires according to the current security policy and can only be used for this account.",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");
}
