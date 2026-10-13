import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const store = getStore("folder-locker-public-stats");
const DAY_MS = 24 * 60 * 60 * 1000;
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*"
};

export default async (request) => {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }
  try {
    const url = new URL(request.url);
    const visitorId = (url.searchParams.get("visitorId") || "").slice(0, 120);
    let counted = false;
    if (visitorId) {
      const hash = createHash("sha256").update(visitorId).digest("hex");
      const visitorKey = `visitor:${hash}`;
      const now = Date.now();
      const prior = await store.get(visitorKey, { type: "json" });
      const priorAt = prior && Number(prior.lastCountedAt || 0);
      if (!priorAt || now - priorAt >= DAY_MS) {
        const totals = await store.get("totals", { type: "json" }) || { visits: 0 };
        totals.visits = Number(totals.visits || 0) + 1;
        await store.setJSON("totals", totals);
        await store.setJSON(visitorKey, { lastCountedAt: now });
        counted = true;
      }
    }
    const totals = await store.get("totals", { type: "json" }) || { visits: 0 };
    return new Response(JSON.stringify({ visits: Number(totals.visits || 0), counted }), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Stats temporarily unavailable" }), { status: 503, headers });
  }
};
