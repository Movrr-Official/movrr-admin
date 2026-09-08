import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import AccountSetupEmail, { accountSetupText } from "@/emails/account-setup";
import AdminNotificationEmail, { adminNotificationText } from "@/emails/admin-notification";
import OperationalAlertEmail, { operationalAlertText } from "@/emails/operational-alert";
import PasswordResetEmail, { passwordResetText } from "@/emails/password-reset";
import UserConfirmationEmail, { userConfirmationText } from "@/emails/user-confirmation";
import UserWelcomeEmail, { userWelcomeText } from "@/emails/user-welcome";
import WorkboardInviteEmail, { workboardInviteText } from "@/emails/workboard-invite";
import RewardLifecycleEmail, { rewardLifecycleText } from "@/emails/reward-lifecycle";
import CampaignLifecycleEmail, { campaignLifecycleText } from "@/emails/campaign-lifecycle";
import WorkspaceAccessEmail, { workspaceAccessText } from "@/emails/workspace-access";

const fixtures = [
  {
    name: "account setup",
    element: AccountSetupEmail({ name: "Ada", setupUrl: "https://admin.movrr.nl/setup?token=abc" }),
    text: accountSetupText({ name: "Ada", setupUrl: "https://admin.movrr.nl/setup?token=abc" }),
    url: "https://admin.movrr.nl/setup?token=abc",
  },
  {
    name: "password reset",
    element: PasswordResetEmail({ name: "Ada", resetUrl: "https://admin.movrr.nl/reset?token=abc" }),
    text: passwordResetText({ name: "Ada", resetUrl: "https://admin.movrr.nl/reset?token=abc" }),
    url: "https://admin.movrr.nl/reset?token=abc",
  },
  {
    name: "admin welcome",
    element: UserWelcomeEmail({ name: "Ada", role: "admin", dashboardUrl: "https://admin.movrr.nl", id: "invite-1" }),
    text: userWelcomeText({ name: "Ada", role: "admin", dashboardUrl: "https://admin.movrr.nl", id: "invite-1" }),
    url: "https://admin.movrr.nl",
  },
  {
    name: "waitlist confirmation",
    element: UserConfirmationEmail({ name: "Ada", city: "Rotterdam", bikeOwnership: "own", ctaUrl: "https://movrr.nl" }),
    text: userConfirmationText({ name: "Ada", city: "Rotterdam", bikeOwnership: "own", ctaUrl: "https://movrr.nl" }),
    url: "https://movrr.nl",
  },
  {
    name: "waitlist admin notification",
    element: AdminNotificationEmail({ name: "Ada", email: "ada@example.com", city: "Rotterdam", bikeOwnership: "own", timestamp: "2026-09-07T12:00:00.000Z", adminUrl: "https://admin.movrr.nl/waitlist" }),
    text: adminNotificationText({ name: "Ada", email: "ada@example.com", city: "Rotterdam", bikeOwnership: "own", timestamp: "2026-09-07T12:00:00.000Z", adminUrl: "https://admin.movrr.nl/waitlist" }),
    url: "https://admin.movrr.nl/waitlist",
  },
  {
    name: "Workboard invitation",
    element: WorkboardInviteEmail({ inviteUrl: "https://admin.movrr.nl/workboard/invite?token=abc", role: "editor", expiresAt: "2026-09-14T12:00:00.000Z" }),
    text: workboardInviteText({ inviteUrl: "https://admin.movrr.nl/workboard/invite?token=abc", role: "editor", expiresAt: "2026-09-14T12:00:00.000Z" }),
    url: "https://admin.movrr.nl/workboard/invite?token=abc",
  },
  {
    name: "workspace access",
    element: WorkspaceAccessEmail({ change: "access_granted", name: "Ada", organisationName: "MOVRR Partner", role: "Manager", actionUrl: "https://app.movrr.nl/dashboard" }),
    text: workspaceAccessText({ change: "access_granted", name: "Ada", organisationName: "MOVRR Partner", role: "Manager", actionUrl: "https://app.movrr.nl/dashboard" }),
    url: "https://app.movrr.nl/dashboard",
  },
  {
    name: "campaign lifecycle",
    element: CampaignLifecycleEmail({ name: "Ada", campaignName: "City Centre launch", status: "active", actionUrl: "https://app.movrr.nl/dashboard/campaigns/campaign-1" }),
    text: campaignLifecycleText({ name: "Ada", campaignName: "City Centre launch", status: "active", actionUrl: "https://app.movrr.nl/dashboard/campaigns/campaign-1" }),
    url: "https://app.movrr.nl/dashboard/campaigns/campaign-1",
  },
  {
    name: "reward lifecycle",
    element: RewardLifecycleEmail({ kind: "ready", name: "Ada", rewardName: "MOVRR bottle", pointsSpent: 1200, occurredAt: "2026-09-07T12:00:00.000Z", expiresAt: "2026-09-14T12:00:00.000Z", actionUrl: "https://app.movrr.nl/dashboard/rewards/orders/order-1" }),
    text: rewardLifecycleText({ kind: "ready", name: "Ada", rewardName: "MOVRR bottle", pointsSpent: 1200, occurredAt: "2026-09-07T12:00:00.000Z", expiresAt: "2026-09-14T12:00:00.000Z", actionUrl: "https://app.movrr.nl/dashboard/rewards/orders/order-1" }),
    url: "https://app.movrr.nl/dashboard/rewards/orders/order-1",
  },
  {
    name: "operational alert",
    element: OperationalAlertEmail({ subject: "Queue warning", message: "Three fulfilments need attention." }),
    text: operationalAlertText({ subject: "Queue warning", message: "Three fulfilments need attention." }),
  },
];

describe.each(fixtures)("$name email", ({ element, text, url }) => {
  it("renders a complete, responsive, dark-mode-safe document", async () => {
    const html = await render(element);

    expect(html.toLowerCase()).toContain("<!doctype html");
    expect(html).toContain("color-scheme");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("max-width:640px");
    if (url) expect(html).toContain("mso-padding-alt");
    expect(html).toContain("icon-no-bg-white.png");
    expect(html).toContain(">MOVRR<");
    expect(html).not.toContain("email-wordmark");
    expect(html).not.toContain("undefined");
    expect(html).not.toMatch(/<script|onerror=|onclick=/i);
    if (url) {
      expect(html).toContain(url.replaceAll("&", "&amp;"));
      expect(text).toContain(url);
    }
  });

  it("has a meaningful plain-text alternative", () => {
    expect(text.trim().length).toBeGreaterThan(40);
    expect(text).toContain("MOVRR");
  });
});

it("escapes untrusted template values", async () => {
  const html = await render(
    OperationalAlertEmail({
      subject: "Queue <script>alert(1)</script>",
      message: '<img src=x onerror="alert(1)">',
    }),
  );

  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&lt;img");
});
