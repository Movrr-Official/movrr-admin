"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function AuditPage() {
  const [limit, setLimit] = useState<number>(50);
  const [q, setQ] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const fetchAudit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/optimize/audit/route?limit=${encodeURIComponent(String(limit))}`,
      );
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      } else {
        setResult({ error: `status ${res.status}` });
      }
    } catch (e) {
      setResult({ error: String(e) });
    }
    setLoading(false);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Optimizer Audit</h1>

      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm">Limit</label>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value || 10))}
          className="border px-2 py-1 rounded w-24"
        />

        <label className="text-sm">Filter (substring)</label>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border px-2 py-1 rounded w-64"
          placeholder="search in entries"
        />

        <Button onClick={fetchAudit} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded border p-4">
        {!result && (
          <div className="text-sm text-muted-foreground">
            No data yet. Click Refresh.
          </div>
        )}

        {result && result.error && (
          <div className="text-sm text-red-600">
            Error: {String(result.error)}
          </div>
        )}

        {result && !result.error && (
          <div>
            <div className="mb-2 text-sm">Count: {result.count}</div>
            <div className="space-y-2 max-h-[48vh] overflow-auto">
              {result.entries
                .filter((e: any) => {
                  if (!q) return true;
                  try {
                    return JSON.stringify(e)
                      .toLowerCase()
                      .includes(q.toLowerCase());
                  } catch {
                    return true;
                  }
                })
                .map((e: any, i: number) => (
                  <div
                    key={i}
                    className="p-2 border rounded bg-slate-50 dark:bg-slate-900 text-xs"
                  >
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(e, null, 2)}
                    </pre>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
