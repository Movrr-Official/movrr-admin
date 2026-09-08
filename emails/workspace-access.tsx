import { BaseEmail, DataRow, DataTable } from "./_components/base-email";

export type WorkspaceAccessEmailProps = {
  change: "access_granted" | "role_changed";
  name?: string;
  organisationName: string;
  role: string;
  actionUrl: string;
};

export function workspaceAccessSubject(props: WorkspaceAccessEmailProps): string {
  return props.change === "access_granted"
    ? `You now have access to ${props.organisationName} on MOVRR`
    : `Your role for ${props.organisationName} was updated`;
}

export function workspaceAccessText(props: WorkspaceAccessEmailProps): string {
  const update = props.change === "access_granted"
    ? "You have been granted access to a MOVRR organisation workspace."
    : "Your organisation workspace role has been updated.";
  return `${workspaceAccessSubject(props)}\n\n${props.name ? `Hi ${props.name},\n\n` : ""}${update}\n\nOrganisation: ${props.organisationName}\nRole: ${props.role}\n\nOpen workspace: ${props.actionUrl}\n\nIf you do not recognise this change, contact MOVRR support.\n\nMOVRR · Movement that earns.`;
}

export default function WorkspaceAccessEmail(props: WorkspaceAccessEmailProps = {
  change: "access_granted", name: "Ada", organisationName: "MOVRR Partner",
  role: "Manager", actionUrl: "https://app.movrr.nl/dashboard",
}) {
  props = { ...WorkspaceAccessEmail.PreviewProps, ...props };
  const granted = props.change === "access_granted";
  return (
    <BaseEmail
      previewText={workspaceAccessSubject(props)}
      title={granted ? "Workspace access granted" : "Workspace role updated"}
      intro={props.name ? `Hi ${props.name}, ${granted ? "you have been granted access to a MOVRR organisation workspace." : "your organisation workspace role has been updated."}` : granted ? "You have been granted access to a MOVRR organisation workspace." : "Your organisation workspace role has been updated."}
      actionLabel="Open workspace"
      actionUrl={props.actionUrl}
      footerNote="This is an essential account-access notification. If you do not recognise this change, contact MOVRR support."
      contextLabel="Workspace security"
    >
      <DataTable>
        <DataRow label="Organisation" value={props.organisationName} />
        <DataRow label="Role" value={props.role} />
      </DataTable>
    </BaseEmail>
  );
}

WorkspaceAccessEmail.PreviewProps = {
  change: "access_granted",
  name: "Ada",
  organisationName: "MOVRR Partner",
  role: "Manager",
  actionUrl: "https://app.movrr.nl/dashboard",
} satisfies WorkspaceAccessEmailProps;
