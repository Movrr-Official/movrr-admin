import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Img,
  Text,
} from "@react-email/components";

interface AdminNotificationEmailProps {
  name: string;
  email: string;
  city: string;
  bikeOwnership: string;
  timestamp: string; // ISO or pre-formatted string
  id?: string; // optional submission id or uuid
  source?: string; // optional form / campaign source
  adminUrl?: string; // optional link to admin dashboard for quick action
  locale?: string; // locale for timestamp formatting (default: en-US)
  timeZone?: string; // timezone for timestamp formatting (default: UTC)
}

export default function AdminNotificationEmail({
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
  const bikeStatusText = {
    yes: "Owns a bike",
    no: "Doesn't own a bike",
    planning: "Planning to get a bike",
  };

  return (
    <Html lang={locale.split("-")[0] || "en"}>
      <Head />
      <Preview>
        New Movrr Waitlist Registration - {name} from {city}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://res.cloudinary.com/dgy9bf37b/image/upload/v1769860718/movrr_logo_icon_green_no_bg_pycuih.png"
              width="150"
              height="50"
              alt="Movrr Logo"
              style={logo}
            />
            <Text style={tagline}>
              New Waitlist Registration (Admin Notification)
            </Text>
          </Section>

          <Section style={content}>
            <Heading style={h1}>New Waitlist Signup</Heading>

            <Text style={text}>
              A new potential rider has joined the Movrr waitlist. Details
              below.
            </Text>

            <Section style={detailsBox}>
              <table
                role="presentation"
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                border={0}
                style={{
                  borderCollapse: "collapse",
                  fontFamily: main.fontFamily,
                  fontSize: "14px",
                  color: "#1f2937",
                }}
              >
                <tbody>
                  <tr>
                    <td
                      style={{
                        padding: "6px 8px",
                        verticalAlign: "top",
                        fontWeight: 700,
                        width: 140,
                        fontFamily: main.fontFamily,
                        lineHeight: "1.4",
                      }}
                      valign="top"
                    >
                      Name:
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        fontFamily: main.fontFamily,
                        lineHeight: "1.4",
                      }}
                    >
                      {name}
                    </td>
                  </tr>
                  {id && (
                    <tr>
                      <td
                        style={{
                          padding: "6px 8px",
                          verticalAlign: "top",
                          fontWeight: 700,
                          fontFamily: main.fontFamily,
                          lineHeight: "1.4",
                        }}
                        valign="top"
                      >
                        ID:
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          fontFamily: main.fontFamily,
                          lineHeight: "1.4",
                        }}
                      >
                        {id}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td
                      style={{
                        padding: "6px 8px",
                        verticalAlign: "top",
                        fontWeight: 700,
                      }}
                    >
                      Email:
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        fontFamily: main.fontFamily,
                        lineHeight: "1.4",
                      }}
                    >
                      {email}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: "6px 8px",
                        verticalAlign: "top",
                        fontWeight: 700,
                      }}
                    >
                      City:
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        fontFamily: main.fontFamily,
                        lineHeight: "1.4",
                      }}
                    >
                      {city}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: "6px 8px",
                        verticalAlign: "top",
                        fontWeight: 700,
                      }}
                    >
                      Bike Ownership:
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        fontFamily: main.fontFamily,
                        lineHeight: "1.4",
                      }}
                    >
                      {
                        bikeStatusText[
                          bikeOwnership as keyof typeof bikeStatusText
                        ]
                      }
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: "6px 8px",
                        verticalAlign: "top",
                        fontWeight: 700,
                      }}
                    >
                      Registered on:
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        fontFamily: main.fontFamily,
                        lineHeight: "1.4",
                      }}
                    >
                      {formatTimestamp(timestamp, locale, timeZone)}
                    </td>
                  </tr>
                  {source && (
                    <tr>
                      <td
                        style={{
                          padding: "6px 8px",
                          verticalAlign: "top",
                          fontWeight: 700,
                        }}
                      >
                        Source:
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          fontFamily: main.fontFamily,
                          lineHeight: "1.4",
                        }}
                      >
                        {source}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>

            <Text style={text}>
              <span style={{ fontWeight: 700 }}>Recommended Actions:</span>
            </Text>
            <div style={{ marginTop: 8 }}>
              <ul style={{ margin: "8px 0 0 20px", padding: "0" }}>
                <li>Add to {city} launch list</li>
                <li>Send personalized follow-up if needed</li>
                <li>Track city demand for launch planning</li>
                <li>Consider bike partnership opportunities for non-owners</li>
              </ul>
            </div>

            {adminUrl && (
              <Section style={{ textAlign: "center", marginTop: 18 }}>
                <a
                  href={adminUrl}
                  style={{
                    ...buttonStyle,
                    fontFamily: main.fontFamily,
                    lineHeight: "1.2",
                    textDecoration: "none",
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View in admin dashboard
                </a>
              </Section>
            )}

            <Text style={footer}>
              This is an automated notification from the Movrr waitlist system.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function formatTimestamp(ts: string, locale = "en-US", timeZone = "UTC") {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    });
  } catch (e) {
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
}: {
  name: string;
  email: string;
  city: string;
  bikeOwnership: string;
  timestamp: string;
  id?: string;
  source?: string;
  adminUrl?: string;
}) {
  const bikeStatusText = {
    yes: "Owns a bike",
    no: "Doesn't own a bike",
    planning: "Planning to get a bike",
  } as const;

  const lines = [];
  lines.push(`New Waitlist Signup - ${name} (${city})`);
  if (id) lines.push(`ID: ${id}`);
  lines.push(`Email: ${email}`);
  lines.push(`City: ${city}`);
  lines.push(
    `Bike ownership: ${bikeStatusText[bikeOwnership as keyof typeof bikeStatusText] ?? bikeOwnership}`,
  );
  lines.push(`Registered on: ${timestamp}`);
  if (source) lines.push(`Source: ${source}`);
  lines.push("");
  lines.push("Recommended actions:");
  lines.push("- Add to city launch list");
  lines.push("- Send personalized follow-up if needed");
  lines.push("- Track city demand for launch planning");
  lines.push("- Consider bike partnership opportunities for non-owners");
  if (adminUrl) lines.push(`Admin dashboard: ${adminUrl}`);
  lines.push("");
  lines.push(
    "This is an automated notification from the Movrr waitlist system.",
  );

  return lines.join("\n");
}

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "600px",
};

const header = {
  backgroundColor: "#000000",
  padding: "24px",
  textAlign: "center" as const,
};

const logo = {
  margin: "auto",
  marginBottom: "4px",
};

const tagline = {
  color: "#23b245",
  fontSize: "14px",
  fontWeight: "500",
  margin: "0",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

const buttonStyle = {
  backgroundColor: "#16a34a",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600",
  textDecoration: "none",
  padding: "14px 30px",
  borderRadius: "999px",
  display: "inline-block",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const content = {
  padding: "32px 24px",
};

const h1 = {
  color: "#000000",
  fontSize: "24px",
  fontWeight: "700",
  margin: "0 0 20px 0",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  lineHeight: "1.3",
};

const text = {
  color: "#374151",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const detailsBox = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  padding: "20px",
  margin: "20px 0",
};

const footer = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "32px 0 0 0",
  fontStyle: "italic" as const,
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
