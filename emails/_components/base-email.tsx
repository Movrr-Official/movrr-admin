import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export const MOVRR_LOGO_URL =
  "https://res.cloudinary.com/dgy9bf37b/image/upload/v1769860718/movrr_logo_icon_green_no_bg_pycuih.png";

const FONT =
  "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const PREVIEW_PADDING = "\u200C\u00A0".repeat(90);

export const colors = {
  accent: "#3a7d52",
  accentDark: "#2f6844",
  canvas: "#f4f7f5",
  card: "#ffffff",
  panel: "#eef4ef",
  border: "#dce6dd",
  heading: "#1e3a2c",
  body: "#4d6358",
  muted: "#718078",
} as const;

const EMAIL_CSS = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media (prefers-color-scheme: dark) {
    .email-bg { background-color: #101512 !important; }
    .email-card { background-color: #19201b !important; border-color: #344238 !important; }
    .email-heading, .email-wordmark, .email-value { color: #f1f5f2 !important; }
    .email-body { color: #d1ddd4 !important; }
    .email-muted { color: #a8b6ac !important; }
    .email-panel { background-color: #202b23 !important; border-color: #3a4a3e !important; }
    .email-rule { border-color: #344238 !important; }
    .email-link { color: #8fd1a5 !important; }
  }
  @media only screen and (max-width: 600px) {
    .email-card { width: auto !important; margin: 16px !important; }
    .email-header { padding: 22px 22px 18px !important; }
    .email-content { padding: 24px 22px 22px !important; }
    .email-footer { padding: 18px 22px 22px !important; }
    .email-title { font-size: 23px !important; line-height: 29px !important; }
    .email-button { display: block !important; text-align: center !important; }
  }
`;

interface BaseEmailProps {
  previewText: string;
  title: string;
  intro: ReactNode;
  children?: ReactNode;
  actionLabel?: string;
  actionUrl?: string;
  actionAriaLabel?: string;
  footerNote: ReactNode;
  locale?: string;
  contextLabel?: string;
}

export function BaseEmail({
  previewText,
  title,
  intro,
  children,
  actionLabel,
  actionUrl,
  actionAriaLabel,
  footerNote,
  locale = "en-US",
  contextLabel,
}: BaseEmailProps) {
  const language = locale.split("-")[0] || "en";

  return (
    <Html lang={language}>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{EMAIL_CSS}</style>
      </Head>
      <Preview>
        {previewText}
        {PREVIEW_PADDING}
      </Preview>
      <Body className="email-bg" style={styles.body}>
        <Container className="email-card" style={styles.card}>
          <Section className="email-header" style={styles.header}>
            <Row>
              <Column style={styles.logoColumn}>
                <Img
                  src={MOVRR_LOGO_URL}
                  width="32"
                  height="32"
                  alt="MOVRR"
                  style={styles.logo}
                />
              </Column>
              <Column style={styles.wordmarkColumn}>
                <Text className="email-wordmark" style={styles.wordmark}>
                  MOVRR
                </Text>
                {contextLabel ? (
                  <Text className="email-muted" style={styles.contextLabel}>
                    {contextLabel}
                  </Text>
                ) : null}
              </Column>
            </Row>
          </Section>

          <Hr className="email-rule" style={styles.rule} />

          <Section className="email-content" style={styles.content}>
            <Text className="email-heading email-title" style={styles.title}>
              {title}
            </Text>
            <Text className="email-body" style={styles.intro}>
              {intro}
            </Text>

            {children}

            {actionLabel && actionUrl ? (
              <>
                <Section style={styles.actionSection}>
                  <Button
                    className="email-button"
                    href={actionUrl}
                    aria-label={actionAriaLabel ?? actionLabel}
                    style={styles.button}
                  >
                    {actionLabel}
                  </Button>
                </Section>
                <Text className="email-muted" style={styles.fallbackText}>
                  If the button does not work, copy and paste this link into your
                  browser:<br />
                  <Link
                    className="email-link"
                    href={actionUrl}
                    style={styles.fallbackLink}
                  >
                    {actionUrl}
                  </Link>
                </Text>
              </>
            ) : null}
          </Section>

          <Section className="email-footer email-rule" style={styles.footer}>
            <Text className="email-muted" style={styles.footerText}>
              {footerNote}
            </Text>
            <Text className="email-muted" style={styles.footerText}>
              MOVRR · Movement that earns.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr>
      <td className="email-muted" style={styles.dataLabel} valign="top">
        {label}
      </td>
      <td className="email-value" style={styles.dataValue} valign="top">
        {value}
      </td>
    </tr>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <Section className="email-panel" style={styles.panel}>
      <table
        role="presentation"
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        border={0}
        style={styles.dataTable}
      >
        <tbody>{children}</tbody>
      </table>
    </Section>
  );
}

export function Steps({ items }: { items: readonly ReactNode[] }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding="0"
      cellSpacing="0"
      border={0}
      style={styles.steps}
    >
      <tbody>
        {items.map((item, index) => (
          <tr key={index}>
            <td className="email-muted" style={styles.stepNumber} valign="top">
              {String(index + 1).padStart(2, "0")}
            </td>
            <td className="email-body" style={styles.stepText} valign="top">
              {item}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text className="email-body" style={styles.paragraph}>
      {children}
    </Text>
  );
}

export function SupportingText({ children }: { children: ReactNode }) {
  return (
    <Text className="email-muted" style={styles.supporting}>
      {children}
    </Text>
  );
}

const styles = {
  body: {
    margin: "0",
    padding: "0",
    width: "100%",
    backgroundColor: colors.canvas,
    color: colors.body,
    fontFamily: FONT,
    WebkitTextSizeAdjust: "100%" as const,
  },
  card: {
    width: "100%",
    maxWidth: "560px",
    margin: "40px auto",
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: "14px",
    overflow: "hidden" as const,
  },
  header: { padding: "26px 30px 22px" },
  logoColumn: { width: "42px", verticalAlign: "middle" },
  logo: {
    display: "block",
    width: "32px",
    height: "32px",
    border: "0",
    outline: "none",
  },
  wordmarkColumn: { verticalAlign: "middle" },
  wordmark: {
    margin: "0",
    color: colors.heading,
    fontFamily: FONT,
    fontSize: "16px",
    fontWeight: "800",
    lineHeight: "20px",
    letterSpacing: "0.08em",
  },
  contextLabel: {
    margin: "2px 0 0",
    color: colors.muted,
    fontFamily: FONT,
    fontSize: "11px",
    fontWeight: "700",
    lineHeight: "16px",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
  },
  rule: { margin: "0", borderColor: colors.border },
  content: { padding: "30px 30px 26px" },
  title: {
    margin: "0 0 14px",
    color: colors.heading,
    fontFamily: FONT,
    fontSize: "26px",
    fontWeight: "700",
    lineHeight: "33px",
    letterSpacing: "-0.02em",
  },
  intro: {
    margin: "0 0 18px",
    color: colors.body,
    fontFamily: FONT,
    fontSize: "15px",
    lineHeight: "24px",
  },
  paragraph: {
    margin: "0 0 16px",
    color: colors.body,
    fontFamily: FONT,
    fontSize: "15px",
    lineHeight: "24px",
  },
  panel: {
    margin: "20px 0",
    padding: "14px 16px",
    backgroundColor: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: "10px",
  },
  dataTable: { borderCollapse: "collapse" as const, fontFamily: FONT },
  dataLabel: {
    width: "128px",
    padding: "6px 12px 6px 0",
    color: colors.muted,
    fontFamily: FONT,
    fontSize: "13px",
    lineHeight: "20px",
  },
  dataValue: {
    padding: "6px 0",
    color: colors.heading,
    fontFamily: FONT,
    fontSize: "14px",
    fontWeight: "600",
    lineHeight: "20px",
    wordBreak: "break-word" as const,
  },
  steps: { margin: "6px 0 12px", borderCollapse: "collapse" as const },
  stepNumber: {
    width: "32px",
    padding: "0 8px 10px 0",
    color: colors.accent,
    fontFamily: FONT,
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "22px",
  },
  stepText: {
    padding: "0 0 10px",
    color: colors.body,
    fontFamily: FONT,
    fontSize: "14px",
    lineHeight: "22px",
  },
  actionSection: { margin: "26px 0 14px", textAlign: "center" as const },
  button: {
    minWidth: "210px",
    padding: "14px 24px",
    backgroundColor: colors.accentDark,
    border: `1px solid ${colors.accentDark}`,
    borderRadius: "8px",
    color: "#ffffff",
    fontFamily: FONT,
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "18px",
    textAlign: "center" as const,
    textDecoration: "none",
  },
  fallbackText: {
    margin: "0",
    color: colors.muted,
    fontFamily: FONT,
    fontSize: "12px",
    lineHeight: "19px",
  },
  fallbackLink: {
    color: colors.accentDark,
    textDecoration: "underline",
    wordBreak: "break-all" as const,
  },
  supporting: {
    margin: "14px 0 0",
    color: colors.muted,
    fontFamily: FONT,
    fontSize: "13px",
    lineHeight: "20px",
  },
  footer: {
    padding: "20px 30px 24px",
    borderTop: `1px solid ${colors.border}`,
  },
  footerText: {
    margin: "0 0 5px",
    color: colors.muted,
    fontFamily: FONT,
    fontSize: "12px",
    lineHeight: "18px",
  },
};
