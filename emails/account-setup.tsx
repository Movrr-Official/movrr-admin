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
  Link,
} from "@react-email/components";

interface AccountSetupEmailProps {
  name: string;
  setupUrl: string;
  locale?: string;
}

export default function AccountSetupEmail({
  name,
  setupUrl,
  locale = "en-US",
}: AccountSetupEmailProps) {
  return (
    <Html lang={locale.split("-")[0] || "en"}>
      <Head />
      <Preview>Set up your Movrr account</Preview>
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
            <Text style={tagline}>Account Setup</Text>
          </Section>

          <Section style={content}>
            <Heading style={h1}>Hi {name},</Heading>
            <Text style={text}>
              Your Movrr account is ready. Use the secure link below to create
              your password and complete your first sign-in.
            </Text>

            <Section style={ctaSection}>
              <Link
                href={setupUrl}
                style={{
                  ...button,
                  fontFamily: main.fontFamily,
                  lineHeight: "1.2",
                  textDecoration: "none",
                }}
                aria-label="Set up your Movrr account"
                target="_blank"
                rel="noopener noreferrer"
              >
                Set Up Account
              </Link>
            </Section>

            <Text style={text}>
              If you were not expecting this invitation, you can ignore this
              email.
            </Text>
            <Text style={footer}>
              This link expires according to your security policy.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
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
  margin: "auto",
  marginBottom: "4px",
};

const tagline = {
  color: "#23b245",
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
