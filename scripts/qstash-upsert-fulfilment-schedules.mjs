#!/usr/bin/env node
/**
 * Upsert QStash schedules for Fulfilment internal jobs.
 *
 * Required env:
 *   QSTASH_TOKEN     — Upstash QStash token
 *   ADMIN_APP_URL    — production admin origin with https:// (no trailing slash)
 *
 * Usage:
 *   node scripts/qstash-upsert-fulfilment-schedules.mjs
 */

const token = process.env.QSTASH_TOKEN?.trim();
const baseUrl = process.env.ADMIN_APP_URL?.replace(/\/$/, "").trim();

if (!token) {
  console.error("Missing QSTASH_TOKEN");
  process.exit(1);
}
if (!baseUrl) {
  console.error("Missing ADMIN_APP_URL");
  process.exit(1);
}
if (!/^https?:\/\//i.test(baseUrl)) {
  console.error(
    `ADMIN_APP_URL must include http:// or https:// (got: ${baseUrl})`,
  );
  process.exit(1);
}

/** @type {Array<{ id: string, cron: string, path: string }>} */
const schedules = [
  {
    id: "fulfilment-expire",
    cron: "*/15 * * * *",
    path: "/api/v1/internal/jobs/fulfilment-expire",
  },
  {
    id: "fulfilment-release",
    cron: "*/15 * * * *",
    path: "/api/v1/internal/jobs/fulfilment-release",
  },
  {
    id: "fulfilment-retry",
    cron: "*/30 * * * *",
    path: "/api/v1/internal/jobs/fulfilment-retry",
  },
];

async function upsertSchedule(schedule) {
  const destination = `${baseUrl}${schedule.path}`;
  // QStash expects the raw destination URL in the path (same as @upstash/qstash).
  // Do NOT encodeURIComponent the whole URL — that turns https:// into https%3A%2F%2F
  // and QStash rejects it as "invalid scheme".
  const url = ["https://qstash.upstash.io", "v2", "schedules", destination].join(
    "/",
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Upstash-Cron": schedule.cron,
      "Upstash-Schedule-Id": schedule.id,
      "Upstash-Method": "POST",
    },
    body: "{}",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${schedule.id} failed (${response.status}): ${text || response.statusText}`,
    );
  }

  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw
  }

  console.log(`✓ ${schedule.id} → ${destination} (${schedule.cron})`, parsed);
}

async function main() {
  console.log(`Upserting QStash schedules for ${baseUrl}`);
  for (const schedule of schedules) {
    await upsertSchedule(schedule);
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
