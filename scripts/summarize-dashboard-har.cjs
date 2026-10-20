// Strip a sanitized Chrome HAR down to comparable timings. Never export cookies,
// headers, query values, request bodies, response content or customer records.
// Usage: node scripts/summarize-dashboard-har.cjs .tmp/task/capture.har
const fs = require("node:fs");
const log = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).log;
const page = log.pages[0];
if (!page) throw new Error("A navigation capture is required");
const origin = Date.parse(page.startedDateTime);
const requests = log.entries.map(entry => ({
  path: new URL(entry.request.url).pathname,
  method: entry.request.method,
  type: entry._resourceType,
  startMs: Math.round(Date.parse(entry.startedDateTime) - origin),
  durationMs: Math.round(entry.time),
  serverWaitMs: Math.round(entry.timings.wait),
  status: entry.response.status,
  action: entry.request.headers.some(header => header.name.toLowerCase() === "next-action"),
  transferredBytes: entry._transferSize ?? entry.response._transferSize ?? null,
}));
console.log(JSON.stringify({
  capturedAt: page.startedDateTime,
  page: new URL(page.title).pathname,
  domContentLoadedMs: Math.round(page.pageTimings.onContentLoad),
  loadMs: Math.round(page.pageTimings.onLoad),
  // Same 55s window excludes later polling, and includes both initial waterfalls.
  requests: requests.filter(request => request.startMs < 55000),
}, null, 2));
