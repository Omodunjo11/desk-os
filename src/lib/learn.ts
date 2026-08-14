import type { CaseItem, LoggedDisposition } from "./types";

/** Coarse fingerprint so similar false positives can downweight the next row — never auto-clear it. */
export function fingerprint(item: CaseItem): string {
  const v = item.values;
  const lane =
    v.typology ?? v.product ?? v.type ?? v.citation ?? v.rule ?? "untyped";
  return `${item.templateId}:${String(lane).toLowerCase()}`;
}

export type SimilarOutcomes = {
  key: string;
  dismissed: number;
  monitored: number;
  acted: number;
};

export function similarOutcomes(
  item: CaseItem,
  ledger: LoggedDisposition[],
  cases: CaseItem[]
): SimilarOutcomes {
  const key = fingerprint(item);
  const byId = new Map(cases.map((row) => [row.id, row]));
  const related = ledger.filter((entry) => {
    const other = byId.get(entry.caseId);
    return other ? fingerprint(other) === key : false;
  });
  return {
    key,
    dismissed: related.filter((row) => row.key === "dismiss").length,
    monitored: related.filter((row) => row.key === "monitor").length,
    acted: related.filter((row) => row.key === "act").length,
  };
}

/**
 * Known-legitimate patterns should cost the analyst less attention.
 * They must still appear. Over-flagging is how trust dies; silent drop is how exams fail.
 */
export function learnFactor(similar: SimilarOutcomes) {
  if (similar.dismissed >= 3) return 0.82;
  if (similar.dismissed >= 1 && similar.acted === 0) return 0.92;
  return 1;
}
