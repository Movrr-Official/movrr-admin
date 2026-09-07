import { BaseEmail, DataRow, DataTable, Paragraph } from "./_components/base-email";

export type RewardLifecycleEmailProps = {
  kind: "redemption_received" | "ready" | "completed" | "cancelled" | "failed" | "expired" | "refunded";
  name?: string;
  rewardName: string;
  pointsSpent?: number;
  occurredAt: string;
  expiresAt?: string | null;
  actionUrl: string;
};

const COPY = {
  redemption_received: {
    subject: "We received your MOVRR reward order",
    title: "Reward order received",
    intro: "Your points were redeemed and we have started preparing your reward.",
    action: "Track reward",
  },
  ready: {
    subject: "Your MOVRR reward is ready",
    title: "Your reward is ready",
    intro: "Your reward is ready for the next step. Open MOVRR for the collection or access details.",
    action: "View reward",
  },
  completed: {
    subject: "Your MOVRR reward is complete",
    title: "Reward completed",
    intro: "Your reward has been fulfilled successfully.",
    action: "View order",
  },
  cancelled: {
    subject: "Your MOVRR reward order was cancelled",
    title: "Reward order cancelled",
    intro: "Your reward order has been cancelled. Open the order for the latest status and any points adjustment.",
    action: "Review order",
  },
  failed: {
    subject: "There is an issue with your MOVRR reward",
    title: "Reward fulfilment issue",
    intro: "We could not complete your reward as expected. Open the order for the latest status and next steps.",
    action: "Review order",
  },
  expired: {
    subject: "Your MOVRR reward order expired",
    title: "Reward order expired",
    intro: "The time available to use or collect this reward has ended. Open the order for details.",
    action: "View order",
  },
  refunded: {
    subject: "Your MOVRR reward points were refunded",
    title: "Reward refunded",
    intro: "The points for this reward order have been returned to your MOVRR balance.",
    action: "View wallet",
  },
} as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function rewardLifecycleSubject(kind: RewardLifecycleEmailProps["kind"]): string {
  return COPY[kind].subject;
}

export function rewardLifecycleText(props: RewardLifecycleEmailProps): string {
  const copy = COPY[props.kind];
  const rows = [
    `Reward: ${props.rewardName}`,
    props.pointsSpent === undefined ? null : `Points: ${props.pointsSpent.toLocaleString("en")}`,
    `Updated: ${formatDate(props.occurredAt)} UTC`,
    props.expiresAt ? `Use by: ${formatDate(props.expiresAt)} UTC` : null,
  ].filter(Boolean);
  return `${copy.title}\n\n${props.name ? `Hi ${props.name},\n\n` : ""}${copy.intro}\n\n${rows.join("\n")}\n\n${copy.action}: ${props.actionUrl}\n\nMOVRR · Movement that earns.`;
}

export default function RewardLifecycleEmail(props: RewardLifecycleEmailProps) {
  const copy = COPY[props.kind];
  return (
    <BaseEmail
      previewText={`${copy.title}: ${props.rewardName}`}
      title={copy.title}
      intro={props.name ? `Hi ${props.name}, ${copy.intro.charAt(0).toLowerCase()}${copy.intro.slice(1)}` : copy.intro}
      actionLabel={copy.action}
      actionUrl={props.actionUrl}
      footerNote="This service message was sent because it concerns a reward order on your MOVRR account."
      contextLabel="Rewards"
    >
      <DataTable>
        <DataRow label="Reward" value={props.rewardName} />
        {props.pointsSpent !== undefined ? (
          <DataRow label="Points" value={props.pointsSpent.toLocaleString("en")} />
        ) : null}
        <DataRow label="Updated" value={`${formatDate(props.occurredAt)} UTC`} />
        {props.expiresAt ? (
          <DataRow label="Use by" value={`${formatDate(props.expiresAt)} UTC`} />
        ) : null}
      </DataTable>
      {props.kind === "failed" ? (
        <Paragraph>Your points remain protected; the order page shows whether a refund has completed.</Paragraph>
      ) : null}
    </BaseEmail>
  );
}
