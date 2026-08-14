import type {
  CaseItem,
  PriorityBand,
  ProcessCustomization,
  ProcessTemplate,
  RankingInput,
  Severity,
} from "./types";

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
  custom?: ProcessCustomization
) {
  const base = weightedScore(item.scores, template.rankingInputs, custom?.weights);
  return clamp(base * (0.55 + 0.45 * recencyFactor(item.recencyHours)));
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

export function rankCases(
  cases: CaseItem[],
  template: ProcessTemplate,
  custom?: ProcessCustomization
) {
  return [...cases]
    .map((item) => {
      const score = priorityScore(item, template, custom);
      return { item, score, band: band(score), severity: severityOf(item) };
    })
    .sort((a, b) => b.score - a.score);
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
    if (type === "score") return formatScore(value);
  }
  return String(value);
}
