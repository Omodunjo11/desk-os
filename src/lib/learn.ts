import { band, priorityScore } from "./ranking";
import type {
  CaseItem,
  LoggedDisposition,
  ProcessCustomization,
  ProcessTemplate,
} from "./types";

export type WeightSuggestion = {
  key: string;
  label: string;
  direction: "raise" | "lower";
  reason: string;
  occurrences: number;
};

export type LearnSummary = {
  total: number;
  overrides: number;
  overrideRate: number;
  suggestions: WeightSuggestion[];
};

function topDriver(
  item: CaseItem,
  template: ProcessTemplate,
  custom?: ProcessCustomization
): string | undefined {
  let best: string | undefined;
  let bestWeighted = -Infinity;
  for (const input of template.rankingInputs) {
    const weight = custom?.weights[input.key] ?? input.weight;
    const weighted = (item.scores[input.key] ?? 0) * weight;
    if (weighted > bestWeighted) {
      bestWeighted = weighted;
      best = input.key;
    }
  }
  return best;
}

/**
 * Two patterns worth surfacing from a process's history:
 *  - P1 cases the analyst dismissed: the queue cried wolf. Whatever ranking
 *    input was driving those cases into P1 is a candidate to weight down.
 *  - P3 cases the analyst escalated to act: the queue underrated them.
 *    Whatever input was already highest on those cases is a candidate to
 *    weight up.
 * This surfaces a pattern for a human to apply, it never changes a weight
 * on its own.
 */
export function analyzeLearning(
  ledger: LoggedDisposition[],
  cases: CaseItem[],
  template: ProcessTemplate,
  custom?: ProcessCustomization
): LearnSummary {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const rows = ledger.filter((l) => byId.has(l.caseId));

  let overrides = 0;
  const lowerTally = new Map<string, number>();
  const raiseTally = new Map<string, number>();

  for (const row of rows) {
    const item = byId.get(row.caseId);
    if (!item) continue;
    if (item.recommendedDisposition && item.recommendedDisposition !== row.key) {
      overrides += 1;
    }

    const b = band(priorityScore(item, template, custom));
    const driver = topDriver(item, template, custom);
    if (!driver) continue;
    if (b === "P1" && row.key === "dismiss") {
      lowerTally.set(driver, (lowerTally.get(driver) ?? 0) + 1);
    }
    if (b === "P3" && row.key === "act") {
      raiseTally.set(driver, (raiseTally.get(driver) ?? 0) + 1);
    }
  }

  const suggestions: WeightSuggestion[] = [];
  for (const [key, occurrences] of lowerTally) {
    if (occurrences < 2) continue;
    const input = template.rankingInputs.find((i) => i.key === key);
    if (!input) continue;
    suggestions.push({
      key,
      label: input.label,
      direction: "lower",
      occurrences,
      reason: `${occurrences} P1 cases driven by ${input.label.toLowerCase()} got dismissed. The queue is crying wolf on this dimension.`,
    });
  }
  for (const [key, occurrences] of raiseTally) {
    if (occurrences < 2) continue;
    const input = template.rankingInputs.find((i) => i.key === key);
    if (!input) continue;
    suggestions.push({
      key,
      label: input.label,
      direction: "raise",
      occurrences,
      reason: `${occurrences} P3 cases low on ${input.label.toLowerCase()} still got escalated. The queue is underrating this dimension.`,
    });
  }
  suggestions.sort((a, b) => b.occurrences - a.occurrences);

  return {
    total: rows.length,
    overrides,
    overrideRate: rows.length === 0 ? 0 : overrides / rows.length,
    suggestions,
  };
}
