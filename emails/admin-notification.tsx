import {
  BaseEmail,
  DataRow,
  DataTable,
  Steps,
  SupportingText,
} from "./_components/base-email";

interface AdminNotificationEmailProps {
  name: string;
  email: string;
  city: string;
  bikeOwnership: string;
  timestamp: string;
  id?: string;
  source?: string;
  adminUrl?: string;
  locale?: string;
  timeZone?: string;
}

const bikeStatusText: Record<string, string> = {
  yes: "Owns a bike",
  own: "Owns a bike",
  no: "Does not own a bike",
  interested: "Does not own a bike, but is interested",
  planning: "Planning to get a bike",
};

export default function AdminNotificationEmail({
  name = "Ada",
  email = "ada@example.com",
  city = "Rotterdam",
  bikeOwnership = "own",
  timestamp = "2026-09-07T12:00:00.000Z",
  id,
  source,
  adminUrl = "https://admin.movrr.nl/waitlist",
  locale = "en-US",
  timeZone = "UTC",
}: AdminNotificationEmailProps = { name: "Ada", email: "ada@example.com", city: "Rotterdam", bikeOwnership: "own", timestamp: "2026-09-07T12:00:00.000Z", adminUrl: "https://admin.movrr.nl/waitlist" }) {
  const registeredAt = formatTimestamp(timestamp, locale, timeZone);

  return (
    <BaseEmail
      locale={locale}
      contextLabel="Internal notification"
      previewText={`New MOVRR waitlist registration: ${name} in ${city}.`}
      title="New waitlist registration"
      intro="A new potential rider has joined the MOVRR waitlist."
      actionLabel={adminUrl ? "View in admin dashboard" : undefined}
      actionUrl={adminUrl}
      footerNote="Internal MOVRR notification. Do not forward or reply."
    >
      <DataTable>
        <DataRow label="Name" value={name} />
        {id ? <DataRow label="ID" value={id} /> : null}
        <DataRow label="Email" value={email} />
        <DataRow label="City" value={city} />
        <DataRow
          label="Bike status"
          value={bikeStatusText[bikeOwnership] ?? bikeOwnership ?? "Not provided"}
        />
        <DataRow label="Registered" value={registeredAt} />
        {source ? <DataRow label="Source" value={source} /> : null}
      </DataTable>

      <Steps
        items={[
          `Add the registration to the ${city} launch list.`,
          "Track city demand for launch planning.",
          "Follow up personally when needed.",
          "Consider bike partnership opportunities for riders without a bike.",
        ]}
      />
      <SupportingText>
        This message was generated automatically by the MOVRR waitlist system.
      </SupportingText>
    </BaseEmail>
  );
}

AdminNotificationEmail.PreviewProps = {
  name: "Ada",
  email: "ada@example.com",
  city: "Rotterdam",
  bikeOwnership: "own",
  timestamp: "2026-09-07T12:00:00.000Z",
  adminUrl: "https://admin.movrr.nl/waitlist",
} satisfies AdminNotificationEmailProps;

function formatTimestamp(ts: string, locale = "en-US", timeZone = "UTC") {
  try {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts;
    return `${date.toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    })} ${timeZone}`;
  } catch {
    return ts;
  }
}

export function adminNotificationText({
  name,
  email,
  city,
  bikeOwnership,
  timestamp,
  id,
  source,
  adminUrl,
  locale = "en-US",
  timeZone = "UTC",
}: AdminNotificationEmailProps) {
  const lines = [`New MOVRR waitlist registration — ${name} (${city})`];
  if (id) lines.push(`ID: ${id}`);
  lines.push(
    `Email: ${email}`,
    `City: ${city}`,
    `Bike status: ${bikeStatusText[bikeOwnership] ?? bikeOwnership ?? "Not provided"}`,
    `Registered: ${formatTimestamp(timestamp, locale, timeZone)}`,
  );
  if (source) lines.push(`Source: ${source}`);
  lines.push(
    "",
    "Recommended actions:",
    `1. Add the registration to the ${city} launch list.`,
    "2. Track city demand for launch planning.",
    "3. Follow up personally when needed.",
    "4. Consider bike partnership opportunities for riders without a bike.",
  );
  if (adminUrl) lines.push("", `Admin dashboard: ${adminUrl}`);
  lines.push("", "Internal MOVRR notification. Do not forward or reply.");
  return lines.join("\n");
}
