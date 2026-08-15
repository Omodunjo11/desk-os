import { classifyPolicy } from "./policy";
import { learnFactor, similarOutcomes, type SimilarOutcomes } from "./learn";
import type {
  CaseItem,
  LoggedDisposition,
  PolicyHit,
  PriorityBand,
  ProcessCustomization,
  ProcessTemplate,
  RankingInput,
  Severity,
} from "./types";

export type RankedCase = {
  item: CaseItem;
  score: number;
  band: PriorityBand;
  severity: Severity;
  policy: PolicyHit;
  similar: SimilarOutcomes;
  floodCount: number;
  collapsedInto?: string;
};

export function recencyFactor(hours: number) {
  return Math.exp(-hours / 96);
}

export function weightedScore(
  scores: Record<string, number>,
  inputs: RankingInput[],
  weightOverride?: Record<string, number>
) {
  const parts = inputs.map((input) => {
    const weight = weightOverride?.[input.key] ?? input.weight;
    return { weight, value: scores[input.key] ?? 0 };
  });
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0) || 1;
  return parts.reduce((sum, part) => sum + part.value * (part.weight / totalWeight), 0);
}

export function priorityScore(
  item: CaseItem,
  template: ProcessTemplate,
  custom?: ProcessCustomization,
  similar?: SimilarOutcomes
) {
  const base = weightedScore(item.scores, template.rankingInputs, custom?.weights);
  const recency = 0.55 + 0.45 * recencyFactor(item.recencyHours);
  const learned = similar ? learnFactor(similar) : 1;
  return clamp(base * recency * learned);
}

export function band(score: number): PriorityBand {
  if (score >= 0.72) return "P1";
  if (score >= 0.48) return "P2";
  return "P3";
}

export function severityOf(item: CaseItem): Severity {
  const harm = item.scores.harm ?? item.scores.exposure ?? item.scores.safety ?? 0;
  if (harm >= 0.85) return "critical";
  if (harm >= 0.65) return "high";
  if (harm >= 0.4) return "moderate";
  return "low";
}

function isAlarmLike(item: CaseItem) {
  const type = String(item.values.type ?? "").toLowerCase();
  return type === "alarm" || item.title.toLowerCase().includes("alarm");
}

function annotateFlood(rows: RankedCase[]): RankedCase[] {
  const groups = new Map<string, RankedCase[]>();
  for (const row of rows) {
    if (!isAlarmLike(row.item) || row.item.recencyHours > 2) continue;
    const asset = String(row.item.values.asset ?? "").trim();
    if (!asset) continue;
    const list = groups.get(asset) ?? [];
    list.push(row);
    groups.set(asset, list);
  }

  const collapsed = new Map<string, { master: string; count: number }>();
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const master = [...group].sort((a, b) => {
      if (a.policy.floor !== b.policy.floor) return a.policy.floor - b.policy.floor;
      return b.score - a.score;
    })[0];
    for (const row of group) {
      collapsed.set(row.item.id, { master: master.item.id, count: group.length });
    }
  }

  return rows.map((row) => {
    const flood = collapsed.get(row.item.id);
    if (!flood) return row;
    return {
      ...row,
      floodCount: flood.count,
      collapsedInto: flood.master === row.item.id ? undefined : flood.master,
    };
  });
}

export function rankCases(
  cases: CaseItem[],
  template: ProcessTemplate,
  custom?: ProcessCustomization,
  ledger: LoggedDisposition[] = []
): RankedCase[] {
  const ranked = cases.map((item) => {
    const similar = similarOutcomes(item, ledger, cases);
    const score = priorityScore(item, template, custom, similar);
    return {
      item,
      score,
      band: band(score),
      severity: severityOf(item),
      policy: classifyPolicy(item, template, custom),
      similar,
      floodCount: 0,
    };
  });

  ranked.sort((a, b) => {
    if (a.policy.floor !== b.policy.floor) return a.policy.floor - b.policy.floor;
    return b.score - a.score;
  });

  return annotateFlood(ranked);
}

function clamp(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function formatScore(n: number) {
  return n.toFixed(2);
}

export function formatField(type: string, value: string | number) {
  if (typeof value === "number") {
    if (type === "money") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
    }
    if (type === "percent") return `${Math.round(value * 100)}%`;
    if (type === "hours") return `${value}h`;
  }
  if (type === "score") return formatScore(Number(value));
  return String(value);
}
