import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface UserConfirmationEmailProps {
  name: string;
  city: string;
  bikeOwnership: string;
  id?: string;
  ctaUrl?: string;
  locale?: string;
}

export default function UserConfirmationEmail({
  name,
  city,
  bikeOwnership,
  id,
  ctaUrl = "https://movrr.nl",
  locale = "en-US",
}: UserConfirmationEmailProps) {
  const bikeStatusText = {
    yes: "Perfect! You're ready to ride.",
    no: "No worries - we'll help you get started.",
    planning: "Great! We'll keep you updated on bike options.",
  };

  return (
    <Html lang={locale.split("-")[0] || "en"}>
      <Head />
      <Preview>Welcome to Movrr — next steps inside</Preview>
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
            <Text style={tagline}>Ride. Earn. Make Cities Move.</Text>
          </Section>

          <Section style={content}>
            <Heading style={h1}>Welcome to the Movement, {name}!</Heading>

            <Text style={text}>
              You've just joined something bigger than a waitlist - you've
              joined a movement that's transforming city streets into
              opportunities.
            </Text>

            <Section style={infoBox}>
              <Text style={infoTitle}>Your registration details</Text>
              <table
                role="presentation"
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                border={0}
                style={{
                  borderCollapse: "collapse",
                  fontFamily: main.fontFamily,
                  color: "#374151",
                  fontSize: "14px",
                }}
              >
                <tbody>
                  <tr>
                    <td
                      style={{
                        padding: "6px 8px",
                        verticalAlign: "top",
                        fontWeight: 600,
                        width: 140,
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
                        fontWeight: 600,
                      }}
                    >
                      Bike status:
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
                  {id && (
                    <tr>
                      <td
                        style={{
                          padding: "6px 8px",
                          verticalAlign: "top",
                          fontWeight: 600,
                        }}
                      >
                        Signup ID:
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
                </tbody>
              </table>
            </Section>

            <Text style={text}>
              <strong>What happens next?</strong>
            </Text>

            <div style={{ marginTop: 8 }}>
              <ul style={{ margin: "8px 0 16px 20px", padding: 0 }}>
                <li>We'll notify you as soon as Movrr launches in {city}.</li>
                <li>You'll get early access to our rider onboarding.</li>
                <li>Start earning rewards while exploring your city.</li>
                <li>Join a community of riders making cities more vibrant.</li>
              </ul>
            </div>

            <Section style={ctaSection}>
              <Link
                href={ctaUrl}
                style={{
                  ...button,
                  fontFamily: main.fontFamily,
                  lineHeight: "1.2",
                  textDecoration: "none",
                }}
                aria-label="Learn more about Movrr"
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn More About Movrr
              </Link>
            </Section>

            <Text style={footer}>
              Questions? Reply to this email — we're here to help!
              <br />
              The Movrr Team
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function userConfirmationText({
  name,
  city,
  bikeOwnership,
  id,
  ctaUrl,
}: {
  name: string;
  city: string;
  bikeOwnership: string;
  id?: string;
  ctaUrl?: string;
}) {
  const bikeStatusText = {
    yes: "Perfect! You're ready to ride.",
    no: "No worries - we'll help you get started.",
    planning: "Great! We'll keep you updated on bike options.",
  } as const;

  const lines = [];
  lines.push(`Welcome to Movrr — ${name}`);
  lines.push("");
  lines.push(`City: ${city}`);
  lines.push(
    `Bike status: ${bikeStatusText[bikeOwnership as keyof typeof bikeStatusText] ?? bikeOwnership}`,
  );
  if (id) lines.push(`Signup ID: ${id}`);
  lines.push("");
  lines.push("What happens next:");
  lines.push("- We will notify you when Movrr launches in your city.");
  lines.push("- You will get early access to onboarding.");
  lines.push("- Start earning rewards while exploring your city.");
  lines.push("");
  if (ctaUrl) lines.push(`Learn more: ${ctaUrl}`);
  lines.push("");
  lines.push("Questions? Reply to this email.");
  lines.push("The Movrr Team");

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
  padding: "32px 24px",
  textAlign: "center" as const,
};

const logo = {
  margin: "auto",
  marginBottom: "4px",
};

const tagline = {
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "500",
  margin: "0",
  opacity: 0.9,
};

const content = {
  padding: "32px 24px",
};

const h1 = {
  color: "#000000",
  fontSize: "28px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 24px 0",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const text = {
  color: "#374151",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const infoBox = {
  backgroundColor: "#f9fafb",
  border: "2px solid #e5e7eb",
  padding: "20px",
  margin: "24px 0",
};

const infoTitle = {
  color: "#000000",
  fontSize: "16px",
  fontWeight: "600",
  margin: "0 0 12px 0",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const infoText = {
  color: "#374151",
  fontSize: "14px",
  margin: "0 0 8px 0",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const ctaSection = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
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

const footer = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "32px 0 0 0",
  textAlign: "center" as const,
};
