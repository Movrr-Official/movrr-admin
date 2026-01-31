import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Link,
} from "@react-email/components";

interface UserWelcomeEmailProps {
  name: string;
  role: string;
  dashboardUrl: string;
  id?: string;
  locale?: string;
}

export default function UserWelcomeEmail({
  name,
  role,
  dashboardUrl,
  id,
  locale = "en-US",
}: UserWelcomeEmailProps) {
  return (
    <Html lang={locale.split("-")[0] || "en"}>
      <Head />
      <Preview>Welcome to Movrr Admin — access details inside</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>Movrr</Heading>
            <Text style={tagline}>Admin Access Granted</Text>
          </Section>

          <Section style={content}>
            <Heading style={h1}>Welcome, {name}</Heading>
            <Text style={text}>
              Your Movrr Admin account has been created with the role of
              <strong style={{ fontFamily: main.fontFamily }}> {role}</strong>.
            </Text>
            <Text style={text}>
              Use the link below to access the dashboard and set your password.
            </Text>

            <Section style={ctaSection}>
              <Link
                href={dashboardUrl}
                style={{
                  ...button,
                  fontFamily: main.fontFamily,
                  lineHeight: "1.2",
                  textDecoration: "none",
                }}
                aria-label="Open Movrr Admin"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Movrr Admin
              </Link>
            </Section>

            <Text style={footer}>
              If you did not expect this email, please contact your
              administrator immediately.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function userWelcomeText({
  name,
  role,
  dashboardUrl,
  id,
}: {
  name: string;
  role: string;
  dashboardUrl: string;
  id?: string;
}) {
  const lines = [];
  lines.push(`Welcome to Movrr Admin, ${name}`);
  lines.push("");
  lines.push(`Role: ${role}`);
  if (id) lines.push(`Invite ID: ${id}`);
  lines.push("");
  lines.push(`Open your admin dashboard: ${dashboardUrl}`);
  lines.push("");
  lines.push("If you did not expect this email, contact your administrator.");
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
  backgroundColor: "#111827",
  padding: "28px 24px",
  textAlign: "center" as const,
};

const logo = {
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: "800",
  margin: "0 0 6px 0",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const tagline = {
  color: "#22c55e",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

const content = {
  padding: "32px 24px",
};

const h1 = {
  color: "#0f172a",
  fontSize: "24px",
  fontWeight: "700",
  margin: "0 0 16px 0",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  lineHeight: "1.3",
};

const text = {
  color: "#334155",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const ctaSection = {
  textAlign: "center" as const,
  margin: "28px 0",
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
  color: "#64748b",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "32px 0 0 0",
  textAlign: "center" as const,
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
