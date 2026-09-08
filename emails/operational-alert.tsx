import { BaseEmail, Paragraph } from "./_components/base-email";

interface OperationalAlertEmailProps {
  subject: string;
  message: string;
  locale?: string;
}

export default function OperationalAlertEmail({
  subject = "Queue warning",
  message = "Three fulfilments need attention.",
  locale = "en-US",
}: OperationalAlertEmailProps = { subject: "Queue warning", message: "Three fulfilments need attention." }) {
  return (
    <BaseEmail
      locale={locale}
      contextLabel="System alert"
      previewText={message}
      title={subject}
      intro="MOVRR Admin generated the following operational alert."
      footerNote="Internal MOVRR system notification. Do not reply."
    >
      <Paragraph>{message}</Paragraph>
    </BaseEmail>
  );
}

OperationalAlertEmail.PreviewProps = {
  subject: "Queue warning",
  message: "Three fulfilments need attention.",
} satisfies OperationalAlertEmailProps;

export function operationalAlertText({
  subject,
  message,
}: OperationalAlertEmailProps) {
  return [
    subject,
    "",
    "MOVRR Admin generated the following operational alert:",
    "",
    message,
    "",
    "Internal MOVRR system notification. Do not reply.",
  ].join("\n");
}
