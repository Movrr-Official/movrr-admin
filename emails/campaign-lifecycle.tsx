import { BaseEmail, DataRow, DataTable } from "./_components/base-email";
import {
  campaignLifecycleLabel,
  type CampaignLifecycleStatus,
} from "@/features/platform/vocabulary";

export type CampaignLifecycleEmailProps = {
  name?: string;
  campaignName: string;
  status: CampaignLifecycleStatus;
  actionUrl: string;
};

export function campaignLifecycleSubject(props: CampaignLifecycleEmailProps): string {
  return `${props.campaignName} is now ${campaignLifecycleLabel(props.status).toLowerCase()}`;
}

export function campaignLifecycleText(props: CampaignLifecycleEmailProps): string {
  return `Campaign status updated\n\n${props.name ? `Hi ${props.name},\n\n` : ""}${props.campaignName} is now ${campaignLifecycleLabel(props.status).toLowerCase()}.\n\nReview campaign: ${props.actionUrl}\n\nYou receive campaign updates because they are enabled in your MOVRR advertiser preferences.\n\nMOVRR · Movement that earns.`;
}

export default function CampaignLifecycleEmail(props: CampaignLifecycleEmailProps = {
  name: "Ada", campaignName: "City Centre launch", status: "active",
  actionUrl: "https://app.movrr.nl/dashboard/campaigns/preview",
}) {
  props = { ...CampaignLifecycleEmail.PreviewProps, ...props };
  const label = campaignLifecycleLabel(props.status);
  return (
    <BaseEmail
      previewText={`${props.campaignName} is now ${label.toLowerCase()}.`}
      title="Campaign status updated"
      intro={props.name ? `Hi ${props.name}, your campaign has moved to a new lifecycle stage.` : "Your campaign has moved to a new lifecycle stage."}
      actionLabel="Review campaign"
      actionUrl={props.actionUrl}
      footerNote="You receive campaign updates because they are enabled in your MOVRR advertiser preferences."
      contextLabel="Advertiser"
    >
      <DataTable>
        <DataRow label="Campaign" value={props.campaignName} />
        <DataRow label="Status" value={label} />
      </DataTable>
    </BaseEmail>
  );
}

CampaignLifecycleEmail.PreviewProps = {
  name: "Ada",
  campaignName: "City Centre launch",
  status: "active",
  actionUrl: "https://app.movrr.nl/dashboard/campaigns/preview",
} satisfies CampaignLifecycleEmailProps;
