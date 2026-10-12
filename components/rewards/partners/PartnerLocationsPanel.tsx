"use client";
import { useEffect, useRef, useState } from "react";
import { EditorRequestScope } from "@/features/partners/application/editorRequestScope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { platformGet, platformPost } from "@/lib/platformApi/client";
import type { PartnerLocation, LocationPage } from "@/features/partners/domain/PartnerLocation";
export function PartnerLocationsPanel(props: {
    organisationId: string;
}) {
    return <PartnerLocationEditor key={props.organisationId} {...props}/>;
}
function PartnerLocationEditor({ organisationId, }: {
    organisationId: string;
}) {
    const scope = useRef(new EditorRequestScope());
    const [cursor, setCursor] = useState<string | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [rows, setRows] = useState<PartnerLocation[]>([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [rewardIds, setRewardIds] = useState("");
    const [selected, setSelected] = useState<PartnerLocation | null>(null);
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [lat, setLat] = useState("");
    const [lon, setLon] = useState("");
    const [verified, setVerified] = useState(false);
    const [status, setStatus] = useState<PartnerLocation["status"]>("draft");
    const path = "/api/v1/organisations/" +
        encodeURIComponent(organisationId) +
        "/locations";
    useEffect(() => {
        const controller = new AbortController();
        scope.current.invalidate();
        setRows([]);
        setNextCursor(null);
        setLoading(true);
        setError("");
        void platformGet<LocationPage<PartnerLocation>>(path + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), { signal: controller.signal })
            .then((r) => {
            if (!controller.signal.aborted) {
                if (r.ok) {
                    setRows(r.value.locations);
                    setNextCursor(r.value.nextCursor);
                }
                else
                    setError(r.message);
            }
        })
            .catch(() => {
            if (!controller.signal.aborted)
                setError("Locations unavailable");
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => {
            scope.current.invalidate();
            controller.abort();
        };
    }, [path, cursor]);
    function select(row: PartnerLocation | null) {
        setRewardIds((row?.rewardIds ?? []).join(", "));
        setSelected(row);
        setName(row?.name ?? "");
        setAddress(row?.address ?? "");
        setLat(row?.latitude?.toString() ?? "");
        setLon(row?.longitude?.toString() ?? "");
        setVerified(row?.coordinatesVerified ?? false);
        setStatus(row?.status ?? "draft");
    }
    async function save() {
        const ownsResponse = scope.current.capture();
        setBusy(true);
        setError("");
        try {
            const result = await platformPost<PartnerLocation>(path, {
                body: {
                    ...(selected
                        ? { id: selected.id, expectedUpdatedAt: selected.updatedAt }
                        : {}),
                    name,
                    address,
                    latitude: lat.trim() ? Number(lat) : null,
                    longitude: lon.trim() ? Number(lon) : null,
                    status,
                    coordinatesVerified: verified,
                    rewardIds: rewardIds
                        .split(",")
                        .map((id) => id.trim())
                        .filter(Boolean),
                },
            });
            if (!ownsResponse())
                return;
            if (!result.ok) {
                setError(result.message);
                return;
            }
            setRows((old) => [
                ...old.filter((r) => r.id !== result.value.id).slice(-99),
                result.value,
            ]);
            select(result.value);
        }
        catch {
            if (ownsResponse())
                setError("Unable to save location");
        }
        finally {
            if (ownsResponse())
                setBusy(false);
        }
    }
    return (<Card>
      <CardHeader>
        <CardTitle>Physical locations</CardTitle>
        <p className="text-sm text-muted-foreground">
          Partner Operations owns publication. Confirm the real address and
          coordinates before publishing. No opening-hours or inventory
          guarantees.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <fieldset disabled={busy || loading} className="space-y-3">
        {error && <p role="alert">{error}</p>}
        {nextCursor && <Button variant="outline" onClick={() => { select(null); setCursor(nextCursor); }}>Next locations</Button>}
        {cursor && <Button variant="outline" onClick={() => { select(null); setCursor(null); }}>First locations</Button>}
        {rows.map((row) => (<Button key={row.id} variant="outline" onClick={() => select(row)}>
            {row.name} · {row.status}
          </Button>))}
        <Button variant="outline" onClick={() => select(null)}>
          New location
        </Button>
        <label className="block">
          Location name
          <Input value={name} onChange={(e) => setName(e.target.value)}/>
        </label>
        <label className="block">
          Public address
          <Input value={address} onChange={(e) => setAddress(e.target.value)}/>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            Latitude
            <Input type="number" step="any" value={lat} onChange={(e) => {
            setLat(e.target.value);
            setVerified(false);
            setStatus("draft");
        }}/>
          </label>
          <label>
            Longitude
            <Input type="number" step="any" value={lon} onChange={(e) => {
            setLon(e.target.value);
            setVerified(false);
            setStatus("draft");
        }}/>
          </label>
        </div>
        <label className="block">
          Associated catalog item IDs (optional, comma separated)
          <Input value={rewardIds} onChange={(e) => setRewardIds(e.target.value)}/>
        </label>
        <label className="flex gap-2">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)}/>
          I reviewed this physical address and coordinates
        </label>
        <label className="block">
          Publication{" "}
          <select value={status} onChange={(e) => setStatus(e.target.value as PartnerLocation["status"])}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <Button disabled={busy || !name.trim() || !address.trim()} onClick={() => void save()}>
          {busy ? "Saving…" : "Save location"}
        </Button>
      </fieldset>
      </CardContent>
    </Card>);
}
