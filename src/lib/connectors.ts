import { ADAPTER_MAP } from "./adapters";
import { ingestToCases, type PipelineResult } from "./pipeline";

export const DEMO_FEEDS: Record<string, string> = {
  "core-banking": "/api/feeds/core-banking",
  openpages: "/api/feeds/openpages",
  "tm-alerts": "/api/feeds/tm-alerts",
  "plant-ops": "/api/feeds/plant-ops",
};

const BLOCKED_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.0\.0\.0|metadata|\[::1\])/i;

export function isSafePullUrl(url: string, origin: string): { ok: true; href: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return { ok: false, reason: "That is not a URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http(s) pull is allowed." };
  }
  const sameOrigin = parsed.origin === origin;
  const demoFeed = parsed.pathname.startsWith("/api/feeds/");
  if (sameOrigin && demoFeed) return { ok: true, href: parsed.href };
  if (BLOCKED_HOST.test(parsed.hostname) || BLOCKED_HOST.test(parsed.hostname + ".")) {
    return { ok: false, reason: "Will not pull from a private or metadata host." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "External pulls must be https." };
  }
  return { ok: true, href: parsed.href };
}

export async function pullToCases(adapterId: string, body: string): Promise<PipelineResult> {
  const manifest = ADAPTER_MAP[adapterId];
  if (!manifest) {
    return { ok: false, cases: [], records: [], errors: [`Unknown adapter ${adapterId}`] };
  }
  return ingestToCases(body, manifest);
}
