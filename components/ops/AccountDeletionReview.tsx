"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAccountDeletionReview, proposeAccountDeletionReview, reviewAccountDeletionProposal, resolveAccountDeletionCase, type DeletionReviewCategory } from "@/app/actions/accountDeletion";
import { executeAccountDeletionFinancialResolution } from "@/app/actions/accountDeletionFinance";
import { executeAccountDeletionEquipmentReturn } from "@/app/actions/accountDeletionEquipment";
import { getAccountDeletionCampaignReport } from "@/app/actions/accountDeletion";
import { executeAccountDeletionContinuity, executeAccountDeletionBusinessContinuity } from "@/app/actions/accountDeletionContinuity";
import { startAccountDeletionRestoreRecovery, verifyAccountDeletionRestoreQuarantine, authorizeAccountDeletionRestoreReactivation } from "@/app/actions/accountDeletionRecovery";

type Review = { reviewId: string; reasonCode: string; state: string };
type Proposal = { proposalId: string; action: string; reference: string; decision: string; canReview: boolean; canExecute?: boolean };
type ObligationCase = { caseId: string; category: string; state: string; resolutionProposalId: string | null; operations: { operationId: string }[] };
const actions: Record<DeletionReviewCategory, readonly string[]> = {
  finance: ["resolve_obligation"], operations: ["resolve_obligation", "transfer_ownership"],
  compliance: ["review_hold"], recovery: ["reconcile_external", "confirm_invocation_terminated"],
};
const rewardReviewReasons: Record<string, string> = {
  authorship_projection_approval_required: "A shared record requires its exact approved authorship projection. Ownership and business facts must survive; a replacement identity is not permitted.",
  shared_authorship_hold_review_required: "A hold prevents shared authorship projection. Compliance must review the specific hold before processing can continue.",
  campaign_carry_not_confirmed: "Campaign publication must reconcile independent delivery and ledger totals and approve its privacy threshold and aggregate retention before erasure.",
  campaign_carry_approval_required: "The aggregate reporting action needs its versioned Finance, Privacy and partner approvals.",
  campaign_materialized_totals_require_reconciliation: "Cached campaign totals differ from the authoritative independent source contract. Investigate stale data or a verified join discrepancy; do not overwrite figures without approval.",
  broader_campaign_aggregation_required: "The approved cohort threshold is not met. Compliance must approve a broader aggregation that prevents reasonable re-identification.",
  campaign_carry_retention_approval_required: "Aggregate evidence needs approved minimal fields, lawful basis, start event and retention period. Missing approval cannot authorize erasure or indefinite retention.",
  campaign_reporting_retention_review_required: "Aggregate retention expired. Reporting remains withheld until the lawful publication outcome is reviewed; reduced totals must not be presented as verified.",
  historical_ride_time_configuration_missing: "Ride-time reward evidence is missing. Finance must establish trustworthy historical rules; current settings and zero-point assumptions are not permitted.",
  ride_time_component_and_cap_adapter_required: "Ride-time configuration was captured. Component evaluation and reward-cap reconciliation remain required; committed awards must be preserved.",
  active_reward_invocation_requires_reconciliation: "A reward invocation may still be active. Confirm its outcome before further settlement; lease expiry does not authorize a retry.",
  reward_inventory_batch_requires_review: "The reward inventory exceeds the bounded review batch. Complete the outstanding inventory before closure.",
  reward_disposition_approval_required: "The ride-time rules are selected. Approval for this deletion reconciliation action is still required before financial writes.",
  ride_time_timezone_evidence_missing: "The ride's reward day boundary is not reliably recorded. Establish trustworthy evidence before calculating streak eligibility.",
  ride_time_capacity_evidence_missing: "Ride-time wallet capacity evidence is missing. Current wallet settings cannot establish the historical entitlement.",
  ride_time_cap_order_review: "An earlier ride on the same reward day remains unresolved. Reconcile its award before allocating the shared daily cap.",
  ride_bonus_path_evidence_missing: "The route or hot-zone component lacks the durable verified ride path needed for eligibility.",
  ride_quality_evidence_missing: "Verified ride quality evidence is missing. Do not infer a lower quality award.",
  ride_time_window_boundary_review: "A reward eligibility window changed during the ride. Review the occurrence evidence before determining that component.",
  hot_zone_component_exceeds_existing_rpc_bound: "The calculated hot-zone component exceeds the existing award limit. A reviewed disposition is required; the award has not been reduced or discarded.",
  restricted_dependency_disposition_required: "A restrictive dependency or unresolved obligation needs its approved adapter. Shared records remain protected.",
  external_classification_or_provider_review_required: "A legacy or shared asset, missing provider credential or processor scope requires explicit classification. No uncertain external effect will be replayed.",
  journal_retention_approval_required: "The minimized deletion journal needs its approved purpose and retention period before a completion receipt can be issued.",
  approved_disposition_or_operation_review_required: "A disposition or external outcome requires review. The existing invocation remains fenced; lease expiry does not authorize recovery.",
  privacy_field_disposition_requires_adapter: "An immutable or constrained personal field needs its reviewed privacy adapter. Other approved erasure may proceed.",
  ride_time_cap_provenance_review: "Ride-time cap consumption cannot be established reliably. Finance must reconcile trustworthy evidence before settlement.",
  ride_verification_configuration_conflict: "Verified ride conditions conflict with captured thresholds. Establish the authoritative evidence before any reward write.",
};
export function AccountDeletionReview({ requestId, category }: { requestId: string; category: DeletionReviewCategory }) {
  const [reference, setReference] = useState("");
  const [action, setAction] = useState(actions[category][0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnProof, setReturnProof] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [continuitySource, setContinuitySource] = useState("");
  const [campaignReport, setCampaignReport] = useState<{ state: string; totals: Record<string, number> } | null>(null);
  const query = useQuery({ queryKey: ["account-deletion-review", requestId, category], retry: false, queryFn: async () => {
    const result = await getAccountDeletionReview(requestId, category);
    if (!result.success) throw new Error(result.error);
    const data = result.data as { contractVersion?: number; reviews?: Review[]; proposals?: Proposal[]; cases?: ObligationCase[] } | null;
    if (data?.contractVersion !== 1 || !Array.isArray(data.reviews) || !Array.isArray(data.proposals)) throw new Error("Review contract unavailable");
    if (data.cases !== undefined && (!Array.isArray(data.cases) || data.cases.some(item => !item || typeof item.caseId !== "string" || !Array.isArray(item.operations)))) throw new Error("Case contract unavailable");
    return data as { contractVersion: 1; reviews: Review[]; proposals: Proposal[]; cases?: ObligationCase[] };
  }});
  async function perform(task: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    try {
      const result = await task();
      setMessage(result.success ? "Review recorded. Processing still requires approved policy and verified evidence." : result.error ?? "Review unavailable");
      if (result.success) await query.refetch();
    } finally { setBusy(false); }
  }
  return <div className="space-y-3 border-t border-border pt-3">
    <p className="font-medium capitalize">{category} review</p>
    {category === "operations" && <Input aria-label="Continuity source record" placeholder="Ride, membership or advertiser record ID for the approved continuity proposal" value={continuitySource} onChange={event => setContinuitySource(event.target.value)} maxLength={36} />}
    {category === "compliance" && <div className="space-y-2">
      <Input aria-label="Campaign review reference" placeholder="Campaign ID for this deletion case" value={campaignId} onChange={event => setCampaignId(event.target.value)} maxLength={36} />
      <Button size="sm" variant="outline" disabled={busy || !campaignId} onClick={() => void perform(async () => {
        setCampaignReport(null);
        const result = await getAccountDeletionCampaignReport(requestId, campaignId);
        if (result.success) setCampaignReport(result.data);
        return result;
      })}>Verify aggregate campaign reporting</Button>
      {campaignReport?.state === "review" && <p>Campaign reporting requires its approved reconciliation, privacy threshold or retention decision.</p>}
      {campaignReport?.state === "confirmed" && <dl>{Object.entries(campaignReport.totals).map(([name, value]) => <div key={name} className="flex gap-2"><dt>{name.replaceAll("_", " ")}</dt><dd>{value}</dd></div>)}</dl>}
    </div>}
    {query.isLoading && <p>Loading review…</p>}
    {query.error && <p role="alert">Review unavailable or access restricted.</p>}
    {query.data?.reviews.map(item => <p key={item.reviewId}>{rewardReviewReasons[item.reasonCode] ?? item.reasonCode.replaceAll("_", " ")} · {item.state}</p>)}
    {query.data?.cases?.map(item => <div key={item.caseId} className="space-y-2 rounded border border-border p-2">
      <p>{item.category.replaceAll("_", " ")} · {item.state}</p>
      {category === "operations" && item.category === "equipment_custody_event" && <Button size="sm" variant="outline" disabled={busy} onClick={() => setReturnProof(item.caseId)}>Select restricted return proof</Button>}
      {category === "operations" && item.category === "equipment_obligation" && <Button size="sm" variant="outline" disabled={busy || !returnProof} onClick={() => { setAction("resolve_obligation"); setReference(item.caseId + ":" + returnProof + ":return_verified"); }}>Propose verified equipment return</Button>}
      {category === "finance" && item.category === "redemption_obligation" && ["honor_proven_fulfilment", "approved_proven_alternative", "verified_refund"].map(disposition => <Button key={disposition} size="sm" variant="outline" disabled={busy} onClick={() => { setAction("resolve_obligation"); setReference(item.caseId + ":" + disposition); }}>Propose {disposition.replaceAll("_", " ")}</Button>)}
      {item.state !== "resolved" && actions[category].includes("resolve_obligation") && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setAction("resolve_obligation"); setReference(item.caseId); }}>Prepare case resolution proposal</Button>}
      {item.state !== "resolved" && actions[category].includes("resolve_obligation") && item.resolutionProposalId && item.operations.map(operation => <Button key={operation.operationId} size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => resolveAccountDeletionCase(item.caseId, item.resolutionProposalId!, category, operation.operationId))}>Resolve confirmed disposition</Button>)}
    </div>)}
    {query.data?.proposals.map(item => <div key={item.proposalId} className="space-y-2 rounded border border-border p-2">
      <p>{item.action.replaceAll("_", " ")} · {item.reference} · {item.decision}</p>
      {category === "recovery" && item.canExecute === true && item.decision === "approved" && item.action === "reconcile_external" && item.reference.startsWith("restore:") && <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => startAccountDeletionRestoreRecovery(requestId, item.proposalId))}>Queue reviewed restore erasure</Button>}
      {category === "recovery" && item.canExecute === true && item.decision === "approved" && item.action === "reconcile_external" && item.reference.startsWith("reactivate:") && <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => authorizeAccountDeletionRestoreReactivation(requestId, item.proposalId))}>Authorize verified reactivation</Button>}
      {category === "operations" && item.canExecute === true && item.decision === "approved" && ["transfer_ownership", "resolve_obligation"].includes(item.action) && ["community_transfer", "community_cancel", "organisation_detach"].map(kind => <Button key={kind} size="sm" variant="outline" disabled={busy || !continuitySource} onClick={() => void perform(() => executeAccountDeletionContinuity(item.proposalId, continuitySource, kind as "community_transfer" | "community_cancel" | "organisation_detach"))}>Execute reviewed {kind.replaceAll("_", " ")}</Button>)}
      {category === "finance" && item.canExecute === true && item.decision === "approved" && item.reference.split(":").length === 2 && ["honor_proven_fulfilment", "approved_proven_alternative", "verified_refund"].includes(item.reference.split(":")[1]) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => executeAccountDeletionFinancialResolution(item.reference.split(":")[0], item.proposalId, item.reference.split(":")[1]))}>Execute reviewed financial disposition</Button>}
      {category === "operations" && item.canExecute === true && item.decision === "approved" && item.action === "transfer_ownership" && item.reference.split(":").length === 2 && <Button size="sm" variant="outline" disabled={busy || !continuitySource} onClick={() => void perform(() => executeAccountDeletionBusinessContinuity(item.proposalId, continuitySource, "advertiser_transfer", item.reference.split(":")[1]))}>Execute consented advertiser transfer</Button>}
      {category === "operations" && item.canExecute === true && item.decision === "approved" && item.action === "resolve_obligation" && item.reference.endsWith(":stop") && <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => executeAccountDeletionBusinessContinuity(item.proposalId, item.reference.split(":")[0], "export_stop"))}>Stop reviewed scheduled export</Button>}
      {category === "operations" && item.canExecute === true && item.decision === "approved" && item.reference.split(":").length === 3 && item.reference.split(":")[2] === "return_verified" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => executeAccountDeletionEquipmentReturn(item.reference.split(":")[0], item.proposalId, item.reference.split(":")[1]))}>Execute reviewed equipment return</Button>}
      {item.canReview && item.decision === "pending" && <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => reviewAccountDeletionProposal(item.proposalId, category, "approved"))}>Approve proposal</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => reviewAccountDeletionProposal(item.proposalId, category, "rejected"))}>Reject proposal</Button>
      </div>}
      {!item.canReview && item.decision === "pending" && <p>A different authorized colleague must review this proposal.</p>}
    </div>)}
    <div className="flex flex-wrap gap-2">
      {category === "recovery" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => verifyAccountDeletionRestoreQuarantine(requestId))}>Verify restored-data erasure</Button>}
      {actions[category].map(value => <Button key={value} size="sm" variant={action === value ? "default" : "outline"} onClick={() => setAction(value)}>{value.replaceAll("_", " ")}</Button>)}
    </div>
    <Input aria-label="Internal review reference" placeholder="Internal approval or incident reference" value={reference} onChange={event => setReference(event.target.value)} maxLength={200} />
    <Button size="sm" variant="outline" disabled={busy || !reference.trim()} onClick={() => void perform(() => proposeAccountDeletionReview(requestId, category, action, reference.trim()))}>Submit review proposal</Button>
    {message && <p role="status">{message}</p>}
  </div>;
}
