import { Text } from "@react-email/components";
import {
  BaseEmail,
  DataRow,
  DataTable,
  Steps,
  SupportingText,
  colors,
} from "./_components/base-email";

interface UserConfirmationEmailProps {
  name: string;
  city: string;
  bikeOwnership: string;
  id?: string;
  ctaUrl?: string;
  locale?: string;
}

const bikeStatusText: Record<string, string> = {
  yes: "You own a bike and are ready to ride.",
  own: "You own a bike and are ready to ride.",
  no: "You do not own a bike yet — we will help you get started.",
  interested: "You do not own a bike yet — we will keep you updated.",
  planning: "You are planning to get a bike.",
};

export default function UserConfirmationEmail({
  name,
  city,
  bikeOwnership,
  id,
  ctaUrl = "https://movrr.nl",
  locale = "en-US",
}: UserConfirmationEmailProps) {
  const bikeStatus = bikeStatusText[bikeOwnership] ?? bikeOwnership;

  return (
    <BaseEmail
      locale={locale}
      previewText={`You're on the MOVRR waitlist for ${city}.`}
      title={`You're in, ${name}.`}
      intro={`You've joined more than a waitlist — you're part of a movement turning city streets into opportunities. We'll let you know when MOVRR is ready in ${city}.`}
      actionLabel="Explore MOVRR"
      actionUrl={ctaUrl}
      actionAriaLabel="Learn more about MOVRR"
      footerNote="You received this transactional email because you joined the MOVRR waitlist."
    >
      <DataTable>
        <DataRow label="City" value={city} />
        <DataRow label="Bike status" value={bikeStatus} />
        {id ? <DataRow label="Signup ID" value={id} /> : null}
      </DataTable>

      <Text
        className="email-heading"
        style={{
          margin: "22px 0 12px",
          color: colors.heading,
          fontSize: "15px",
          fontWeight: "700",
          lineHeight: "22px",
        }}
      >
        What happens next
      </Text>
      <Steps
        items={[
          `We'll notify you when MOVRR launches in ${city}.`,
          "You'll get early access to rider onboarding.",
          "You can start earning rewards while exploring your city.",
          "You'll join a community of riders making cities more vibrant.",
        ]}
      />
      <SupportingText>
        Questions? Reply to this email — the MOVRR team is here to help.
      </SupportingText>
    </BaseEmail>
  );
}

export function userConfirmationText({
  name,
  city,
  bikeOwnership,
  id,
  ctaUrl = "https://movrr.nl",
}: UserConfirmationEmailProps) {
  const lines = [
    `You're on the MOVRR waitlist, ${name}.`,
    "",
    `You've joined more than a waitlist — you're part of a movement turning city streets into opportunities. We'll let you know when MOVRR is ready in ${city}.`,
    "",
    `City: ${city}`,
    `Bike status: ${bikeStatusText[bikeOwnership] ?? bikeOwnership}`,
  ];
  if (id) lines.push(`Signup ID: ${id}`);
  lines.push(
    "",
    "What happens next:",
    `1. We'll notify you when MOVRR launches in ${city}.`,
    "2. You'll get early access to rider onboarding.",
    "3. You can start earning rewards while exploring your city.",
    "4. You'll join a community of riders making cities more vibrant.",
    "",
    `Explore MOVRR: ${ctaUrl}`,
    "",
    "Questions? Reply to this email.",
    "The MOVRR Team",
  );
  return lines.join("\n");
}
