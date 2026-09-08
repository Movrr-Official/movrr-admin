import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export const MOVRR_LOGO_URL =
  "https://res.cloudinary.com/dgy9bf37b/image/upload/f_png,q_auto:good,w_420/v1769860718/movrr_logo_icon_green_no_bg_pycuih.png";

const FONT =
  "Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const PREVIEW_PADDING = "\u200C\u00A0".repeat(90);

export const colors = {
  accent: "#10c259",
  accentDark: "#003415",
  canvas: "#003415",
  card: "#ffffff",
  panel: "#ffffff",
  border: "#e5e5e4",
  heading: "#0a3d2e",
  body: "#405b51",
  muted: "#737373",
} as const;

const EMAIL_CSS = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media (prefers-color-scheme: dark) {
    .email-bg { background-color: #101512 !important; }
    .email-card, .email-content { background-color: #0c2d1c !important; border-color: #365142 !important; }
    .email-heading, .email-value { color: #f5f5ef !important; }
    .email-body { color: #d1ddd4 !important; }
    .email-muted { color: #a8b6ac !important; }
    .email-panel { background-color: transparent !important; border-color: #365142 !important; }
    .email-rule { border-color: #344238 !important; }
    .email-link { color: #8fd1a5 !important; }
  }
  @media only screen and (max-width: 600px) {
    .email-card { width: 100% !important; margin: 0 !important; }
    .email-header { padding: 30px 24px 38px !important; }
    .email-content { padding: 34px 24px 38px !important; }
    .email-footer { padding: 24px !important; }
    .email-title { font-size: 36px !important; line-height: 37px !important; }
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
            <Link href="https://movrr.nl" style={styles.logoLink}>
                <Img
                  src={MOVRR_LOGO_URL}
                  width="140"
                  height="50"
                  alt="MOVRR"
                  style={styles.logo}
                />
            </Link>
            {contextLabel ? <Text style={styles.contextLabel}>{contextLabel}</Text> : null}
            <Text className="email-title" style={styles.heroTitle}>{title}</Text>
            <Text style={styles.heroIntro}>{intro}</Text>
            {actionLabel && actionUrl ? (
              <Section style={styles.actionSection}>
                <Button className="email-button" href={actionUrl} aria-label={actionAriaLabel ?? actionLabel} style={styles.button}>
                  {actionLabel} &nbsp;&#8594;
                </Button>
              </Section>
            ) : null}
          </Section>

          <Section className="email-content" style={styles.content}>
            {children}

            {actionLabel && actionUrl ? (
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
            ) : null}
          </Section>

          <Section className="email-footer email-rule" style={styles.footer}>
            <Text className="email-muted" style={styles.footerText}>
              {footerNote}
            </Text>
            <Text className="email-muted" style={styles.footerText}>
              Movement that earns.
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
    maxWidth: "640px",
    margin: "24px auto",
    backgroundColor: colors.card,
    border: "0",
    borderRadius: "0",
    overflow: "hidden" as const,
  },
  header: { padding: "42px 48px 52px", backgroundColor: colors.accentDark },
  logoLink: { display: "inline-block", textDecoration: "none" },
  logo: {
    display: "block",
    width: "140px",
    height: "50px",
    border: "0",
    outline: "none",
  },
  contextLabel: {
    margin: "44px 0 16px",
    color: colors.accent,
    fontFamily: FONT,
    fontSize: "11px",
    fontWeight: "700",
    lineHeight: "16px",
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
  },
  heroTitle: {
    margin: "0 0 20px",
    color: "#fcfcfc",
    fontFamily: FONT,
    fontSize: "46px",
    fontWeight: "600",
    lineHeight: "47px",
    letterSpacing: "-0.045em",
  },
  heroIntro: {
    margin: "0",
    color: "#8ba294",
    fontFamily: FONT,
    fontSize: "16px",
    lineHeight: "26px",
  },
  content: { padding: "42px 48px 46px", backgroundColor: colors.card },
  paragraph: {
    margin: "0 0 16px",
    color: colors.body,
    fontFamily: FONT,
    fontSize: "15px",
    lineHeight: "24px",
  },
  panel: {
    margin: "0 0 30px",
    padding: "6px 0",
    backgroundColor: colors.panel,
    borderTop: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
  },
  dataTable: { borderCollapse: "collapse" as const, fontFamily: FONT },
  dataLabel: {
    width: "128px",
    padding: "14px 16px 14px 0",
    color: colors.muted,
    fontFamily: FONT,
    fontSize: "11px",
    lineHeight: "20px",
  },
  dataValue: {
    padding: "14px 0",
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
  actionSection: { margin: "32px 0 0", textAlign: "left" as const },
  button: {
    minWidth: "210px",
    padding: "15px 26px",
    backgroundColor: "#fafafa",
    border: "1px solid #567260",
    borderRadius: "12px",
    color: colors.heading,
    fontFamily: FONT,
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "18px",
    textAlign: "center" as const,
    textDecoration: "none",
  },
  fallbackText: {
    margin: "8px 0 0",
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
    padding: "26px 48px 30px",
    borderTop: "1px solid #214a35",
    backgroundColor: "#072419",
  },
  footerText: {
    margin: "0 0 5px",
    color: "#91a69a",
    fontFamily: FONT,
    fontSize: "12px",
    lineHeight: "18px",
  },
};
