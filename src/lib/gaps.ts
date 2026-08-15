import { recommendDisposition } from "./deepen";
import type { CaseItem } from "./types";

export type PacketAsk = {
  id: string;
  ask: string;
  source: "missing-field" | "judgment";
};

/** Operator language for source fields. Never show these keys in the queue. */
const FIELD_ASK: Record<string, string> = {
  hold_id: "Stable hold id",
  party_name: "Named party on the hold",
  amount_usd: "Amount in the source system",
  reason_detail: "Why the hold fired",
  next_step: "Named next step before cutoff",
  open_questions: "What is still unknown on this hold",
  screening_score: "Screening score",
  resourceId: "OpenPages issue id",
  "OPSS-Iss:Name": "Issue name",
  "OPSS-Iss:Description": "Issue description",
  "OPSS-Iss:Severity": "Issue severity",
  "OPSS-Iss:Owner": "Named owner",
  "OPSS-Iss:EvidenceStatus": "Control evidence status",
  "OPSS-Iss:Recommendation": "Named next step on the obligation",
  lastTested: "Last control test date",
  alertId: "Alert id",
  focalParty: "Named focal party",
  narrative: "Alert narrative",
  riskScore: "Risk score",
  modelConfidence: "Model confidence",
  analystNextStep: "Named next step for the analyst",
  openQuestion: "What is still unknown",
  eventId: "Event id",
  assetPath: "Asset path",
  detail: "What the line actually saw",
  recommendation: "Named next step on the line",
  safetyBand: "Safety band",
  signalConfidencePct: "Signal confidence",
};

function haystack(item: CaseItem) {
  return `${item.title} ${item.subject} ${item.whyFlagged} ${item.recommendedAction} ${item.uncertainty} ${String(item.values.typology ?? "")} ${String(item.values.product ?? "")} ${String(item.values.type ?? "")}`.toLowerCase();
}

function suggestedDisposition(item: CaseItem) {
  return item.recommendedDisposition ?? recommendDisposition(item.scores);
}

function askForField(field: string) {
  return FIELD_ASK[field] ?? "A field the operator needs that the export did not send";
}

function judgmentAsks(item: CaseItem): PacketAsk[] {
  const text = haystack(item);
  const asks: PacketAsk[] = [];
  if (/ofac|sanctions|sdn|near-match/.test(text)) {
    asks.push({
      id: "second-identifier",
      ask: "Second identifier — legal name, address, or DBA on the invoice",
      source: "judgment",
    });
  }
  if (/\belder\b|exploit/.test(text) && !/poa/.test(text)) {
    asks.push({
      id: "trusted-contact",
      ask: "Call the trusted contact, not the number that initiated the payments",
      source: "judgment",
    });
  }
  if (/\bpoa\b|power of attorney|competing instruction/.test(text)) {
    asks.push({
      id: "capacity",
      ask: "Freeze both instructions. Escalate to the elder specialist, not SAR-first",
      source: "judgment",
    });
  }
  if (/dormant|estate|executor/.test(text)) {
    asks.push({
      id: "executor-packet",
      ask: "Verify the executor packet before anything else leaves",
      source: "judgment",
    });
  }
  if (/genealogy|lot [ab]\b/.test(text) || (item.uncertainty ?? "").toLowerCase().includes("disagree")) {
    asks.push({
      id: "no-majority",
      ask: "Hold the batch. Source fields disagree — do not ship on a majority vote",
      source: "judgment",
    });
  }
  return asks;
}

function missingFieldAsks(item: CaseItem): PacketAsk[] {
  return (item.gaps ?? []).map((field) => ({
    id: `missing:${field}`,
    ask: askForField(field),
    source: "missing-field" as const,
  }));
}

export function isNeedMore(item: CaseItem) {
  if (suggestedDisposition(item) === "monitor") return true;
  if ((item.gaps?.length ?? 0) > 0) return true;
  if (item.intakeCoverage !== undefined && item.intakeCoverage < 0.85) return true;
  return /need more/i.test(item.recommendedAction);
}

/** Named asks for the operator. Source keys never leave this module as display text. */
export function packetAsks(item: CaseItem): PacketAsk[] {
  const asks = [...missingFieldAsks(item)];
  if (isNeedMore(item)) {
    asks.push(...judgmentAsks(item));
  }
  if (asks.length === 0 && suggestedDisposition(item) === "monitor") {
    asks.push({
      id: "incomplete",
      ask: "Harm is high or the packet is incomplete. Do not auto-clear.",
      source: "judgment",
    });
  }
  const seen = new Set<string>();
  return asks.filter((row) => {
    if (seen.has(row.id) || seen.has(row.ask)) return false;
    seen.add(row.id);
    seen.add(row.ask);
    return true;
  });
}

export function asksAreOperatorLanguage(asks: PacketAsk[]) {
  return asks.every(
    (row) =>
      !row.ask.includes(":") &&
      !/openQuestion|analystNextStep|OPSS-Iss|modelConfidence|screening_score/.test(row.ask)
  );
}
