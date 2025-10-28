import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components"

interface AdminNotificationEmailProps {
  name: string
  email: string
  city: string
  bikeOwnership: string
  timestamp: string
}

export default function AdminNotificationEmail({
  name,
  email,
  city,
  bikeOwnership,
  timestamp,
}: AdminNotificationEmailProps) {
  const bikeStatusText = {
    yes: "Owns a bike",
    no: "Doesn't own a bike",
    planning: "Planning to get a bike",
  }

  return (
    <Html>
      <Head />
      <Preview>
        New Movrr Waitlist Registration - {name} from {city}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>Movrr Admin</Heading>
            <Text style={tagline}>New Waitlist Registration</Text>
          </Section>

          <Section style={content}>
            <Heading style={h1}>New Rider Joined! 🎉</Heading>

            <Text style={text}>A new potential rider has joined the Movrr waitlist. Here are their details:</Text>

            <Section style={detailsBox}>
              <Text style={detailRow}>
                <strong>Name:</strong> {name}
              </Text>
              <Text style={detailRow}>
                <strong>Email:</strong> {email}
              </Text>
              <Text style={detailRow}>
                <strong>City:</strong> {city}
              </Text>
              <Text style={detailRow}>
                <strong>Bike Ownership:</strong> {bikeStatusText[bikeOwnership as keyof typeof bikeStatusText]}
              </Text>
              <Text style={detailRow}>
                <strong>Registered:</strong> {timestamp}
              </Text>
            </Section>

            <Text style={text}>
              <strong>Recommended Actions:</strong>
            </Text>

            <Text style={text}>
              • Add to {city} launch list
              <br />• Send personalized follow-up if needed
              <br />• Track city demand for launch planning
              <br />• Consider bike partnership opportunities if they don't own one
            </Text>

            <Text style={footer}>This is an automated notification from the Movrr waitlist system.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#ffffff",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "600px",
}

const header = {
  backgroundColor: "#000000",
  padding: "24px",
  textAlign: "center" as const,
}

const logo = {
  color: "#ffffff",
  fontSize: "24px",
  fontWeight: "700",
  margin: "0 0 4px 0",
}

const tagline = {
  color: "#23b245",
  fontSize: "14px",
  fontWeight: "500",
  margin: "0",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
}

const content = {
  padding: "32px 24px",
}

const h1 = {
  color: "#000000",
  fontSize: "24px",
  fontWeight: "700",
  margin: "0 0 20px 0",
}

const text = {
  color: "#374151",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
}

const detailsBox = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  padding: "20px",
  margin: "20px 0",
}

const detailRow = {
  color: "#1f2937",
  fontSize: "14px",
  margin: "0 0 8px 0",
  fontFamily: "monospace",
}

const footer = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "32px 0 0 0",
  fontStyle: "italic" as const,
}
