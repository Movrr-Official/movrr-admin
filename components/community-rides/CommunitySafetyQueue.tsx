"use client";

import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCommunitySafetyQueue, moderateCommunityContent } from "@/app/actions/communitySafety";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Queue = Awaited<ReturnType<typeof getCommunitySafetyQueue>>;
type Decision = Parameters<typeof moderateCommunityContent>[0];
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Request unavailable")), 20000);
  })]); } finally { clearTimeout(timeout); }
}
const actionLabels = { approve: "Approve publication", restrict: "Restrict content", dismiss: "Dismiss report", remove: "Remove from public view" };
function DecisionButtons({ ride, version, report, reportVersion, canApprove = true }: Pick<Decision, "ride" | "version" | "report" | "reportVersion"> & { canApprove?: boolean }) {
  const { toast } = useToast();
  const checkboxId = useId();
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<Decision | null>(null);
  const cache = useQueryClient();
  async function save(action: Decision["action"]) {
    const request = retry ?? { operation: crypto.randomUUID(), ride, version, report, reportVersion, action, reason };
    setRetry(request); setBusy(true);
    try {
      const result = await bounded(moderateCommunityContent(request));
      if (!result.success) {
        toast({ title: result.error, variant: "destructive" });
        if (result.conflict) { setRetry(null); setReviewed(false); await cache.invalidateQueries({ queryKey: ["communitySafety"] }); }
        return;
      }
      setRetry(null); setReason(""); setReviewed(false);
      await cache.invalidateQueries({ queryKey: ["communitySafety"] });
      await cache.invalidateQueries({ queryKey: ["communityRides"] });
      toast({ title: "Decision recorded" });
    } catch { toast({ title: "Could not save. Retry your decision.", variant: "destructive" }); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <div className="flex items-start gap-3"><Checkbox id={checkboxId} checked={reviewed} disabled={busy || !!retry} onCheckedChange={value => setReviewed(value === true)} /><label htmlFor={checkboxId} className="text-sm text-muted-foreground leading-relaxed">
      I reviewed the text, organiser name and image for harassment, hate, sexual content, violence, illegal or exploitative material, spam and impersonation.</label></div>
    <Textarea aria-label="Decision reason" placeholder="Record the evidence and reason for this decision" maxLength={2000} value={reason} disabled={busy || !!retry} onChange={e => setReason(e.target.value)} />
    <div className="flex flex-wrap gap-2">
      {(report ? ["dismiss", "remove"] as const : ["approve", "restrict"] as const).map(action =>
        <Button key={action} variant={action === "remove" || action === "restrict" ? "destructive" : "outline"}
          disabled={busy || (!retry && (!reviewed || reason.trim().length < 3)) || (!!retry && retry.action !== action) || (action === "remove" && version === null) || (action === "approve" && !canApprove)}
          onClick={() => void save(action)}>{busy ? "Saving…" : actionLabels[action]}</Button>)}
    </div>
  </div>;
}
function Evidence({ title, description, image, imageRequired = false, onImageReady, onImageError }: { title?: string; description?: string | null; image?: string | null; imageRequired?: boolean; onImageReady?: () => void; onImageError?: () => void }) {
  const [failed, setFailed] = useState(false);
  return <div className="space-y-2 break-words"><p className="font-semibold">{title}</p><p className="whitespace-pre-wrap">{description}</p>
    {((imageRequired && !image) || failed) && <p role="alert" className="text-sm text-destructive">The image could not be reviewed. Refresh evidence before deciding.</p>}
    {image && <img src={image} alt="Community cover for staff review" className="max-h-72 max-w-full object-contain" onLoad={() => { setFailed(false); onImageReady?.(); }} onError={() => { setFailed(true); onImageError?.(); }} />}</div>;
}
function PendingReview({ ride }: { ride: Queue["pending"][number] }) {
  const [imageReady, setImageReady] = useState(!ride.cover_image_path);
  const [imageError, setImageError] = useState(false);
  return <article className="space-y-4 rounded-xl border border-border bg-card p-4">
    <Evidence title={ride.title} description={ride.description} image={ride.image} imageRequired={!!ride.cover_image_path}
      onImageReady={() => { setImageReady(true); setImageError(false); }} onImageError={() => { setImageReady(false); setImageError(true); }} />
    {imageError && <p role="alert" className="text-sm text-destructive">The image could not be reviewed. Refresh evidence before approving.</p>}
    <p>Organiser: {ride.organizer_name}</p><p>{ride.meeting_point_name} · {ride.meeting_point_address}</p>
    <DecisionButtons ride={ride.id} version={ride.moderation_version} canApprove={imageReady && !imageError && (!ride.cover_image_path || !!ride.image)} />
  </article>;
}
export function CommunitySafetyQueue() {
  const [status, setStatus] = useState<"open" | "dismissed" | "actioned">("open");
  const [reason, setReason] = useState<Parameters<typeof getCommunitySafetyQueue>[0]["reason"]>();
  const query = useQuery<Queue>({ queryKey: ["communitySafety", status, reason], queryFn: () => bounded(getCommunitySafetyQueue({ status, reason })), refetchInterval: 60000 });
  return <Card><CardHeader><CardTitle>Community safety</CardTitle></CardHeader><CardContent className="space-y-6">
    <p>New and changed content stays private until reviewed. Review reports promptly. Each list shows the oldest 100 items. Account enforcement uses the existing authorised Rider actions.</p>
    <div className="flex flex-wrap gap-3">
      <Select value={status} onValueChange={value => setStatus(value as typeof status)}><SelectTrigger aria-label="Report status"><SelectValue /></SelectTrigger><SelectContent>{["open", "dismissed", "actioned"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      <Select value={reason ?? "all"} onValueChange={value => setReason((value === "all" ? undefined : value) as typeof reason)}><SelectTrigger aria-label="Report reason"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All reasons</SelectItem>{["harassment", "sexual", "violence", "hate", "spam", "impersonation", "other"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      <Button variant="outline" onClick={() => void query.refetch()}>Refresh evidence</Button>
    </div>
    {query.isPending && <div role="status" aria-label="Loading safety queue" className="space-y-3"><Skeleton className="h-6 w-40 motion-reduce:animate-none" /><Skeleton className="h-32 w-full motion-reduce:animate-none" /></div>}
    {query.isError && <p role="alert">Safety queue unavailable. Please retry.</p>}
    {query.data?.reports.map(report => <article key={`${report.id}-${report.version}-${report.current?.moderation_version}`} className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h3 className="font-semibold">{report.target} report · {report.reason} <Badge variant="outline">{report.status}</Badge></h3>
      <p>{new Date(report.created_at).toLocaleString()} · {report.description}</p>
      <p className="font-medium">Evidence at submission</p>
      <Evidence title={report.evidence.title} description={report.evidence.description} image={report.image} imageRequired={!!report.evidence.cover_image_path} />
      <p>Organiser: {report.evidence.organizer_name}</p>
      <p>{report.evidence.meeting_point_name} · {report.evidence.meeting_point_address}</p>
      {report.subject_rider_id && <a className="underline" href={`/riders/${encodeURIComponent(report.subject_rider_id)}`}>Open existing Rider operations</a>}
      <p className="font-medium">Current content {report.current ? `· ${report.current.moderation_state}` : "· removed"}</p>
      {report.current && <Evidence title={report.current.title} description={report.current.description} image={report.currentImage} imageRequired={!!report.current.cover_image_path} />}
      {report.audit.map((a, i) => <p key={i}>{a.action}: {a.reason} · {a.created_at}</p>)}
      {report.status === "open" && <DecisionButtons ride={report.ride_id} version={report.current?.moderation_version ?? null} report={report.id} reportVersion={report.version} />}
    </article>)}
    {query.data && query.data.reports.length === 0 && <p>No reports for these filters.</p>}
    <h3 className="font-semibold">Awaiting publication review</h3>
    {query.data?.pending.map(ride => <PendingReview key={`${ride.id}-${ride.moderation_version}`} ride={ride} />)}
    {query.data && query.data.pending.length === 0 && <p>No content awaiting review.</p>}
  </CardContent></Card>;
}
