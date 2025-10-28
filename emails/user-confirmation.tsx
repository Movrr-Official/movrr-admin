import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface UserConfirmationEmailProps {
  name: string;
  city: string;
  bikeOwnership: string;
}

export default function UserConfirmationEmail({
  name,
  city,
  bikeOwnership,
}: UserConfirmationEmailProps) {
  const bikeStatusText = {
    yes: "Perfect! You're ready to ride.",
    no: "No worries - we'll help you get started.",
    planning: "Great! We'll keep you updated on bike options.",
  };

  return (
    <Html>
      <Head />
      <Preview>Welcome to Movrr - Transform Your Ride!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>Movrr</Heading>
            <Text style={tagline}>Ride. Earn. Make Cities Move.</Text>
          </Section>

          <Section style={content}>
            <Heading style={h1}>Welcome to the Movement, {name}! 🚴‍♂️</Heading>

            <Text style={text}>
              You've just joined something bigger than a waitlist - you've
              joined a movement that's transforming city streets into
              opportunities.
            </Text>

            <Section style={infoBox}>
              <Text style={infoTitle}>Your Registration Details:</Text>
              <Text style={infoText}>📍 City: {city}</Text>
              <Text style={infoText}>
                🚲 Bike Status:{" "}
                {bikeStatusText[bikeOwnership as keyof typeof bikeStatusText]}
              </Text>
            </Section>

            <Text style={text}>
              <strong>What happens next?</strong>
            </Text>

            <Text style={text}>
              • We'll notify you as soon as Movrr launches in {city}
              <br />• You'll get early access to our rider onboarding
              <br />• Start earning €15-30/hour while exploring your city
              <br />• Join a community of riders making cities more vibrant
            </Text>

            <Section style={ctaSection}>
              <Link href="https://movrr.nl" style={button}>
                Learn More About Movrr
              </Link>
            </Section>

            <Text style={footer}>
              Questions? Reply to this email - we're here to help!
              <br />
              The Movrr Team
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
  backgroundColor: "#23b245",
  padding: "32px 24px",
  textAlign: "center" as const,
};

const logo = {
  color: "#ffffff",
  fontSize: "32px",
  fontWeight: "800",
  margin: "0 0 8px 0",
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
};

const text = {
  color: "#374151",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
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
};

const infoText = {
  color: "#374151",
  fontSize: "14px",
  margin: "0 0 8px 0",
};

const ctaSection = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
  backgroundColor: "#ff6b35",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  padding: "16px 32px",
  borderRadius: "24px",
  display: "inline-block",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

const footer = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "32px 0 0 0",
  textAlign: "center" as const,
};
