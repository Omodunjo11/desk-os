import {
  UNMAPPED_ACTION,
  UNMAPPED_UNCERTAINTY,
  UNMAPPED_WHY,
  type AdapterManifest,
} from "./adapters";
import { flattenRecord, hasConflictLanguage, relatedEvidence } from "./flatten";
import type { CaseItem, DispositionKey, Evidence } from "./types";

function present(raw: Record<string, unknown>, field: string) {
  const value = raw[field];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function harmOf(scores: Record<string, number>) {
  return scores.harm ?? scores.exposure ?? scores.safety ?? 0;
}

function confidenceOf(scores: Record<string, number>) {
  return scores.confidence ?? scores.applicability ?? 0.5;
}

function pressureOf(scores: Record<string, number>) {
  return Math.max(
    harmOf(scores),
    scores.urgency ?? 0,
    scores.constraint ?? 0,
    scores.deadline ?? 0
  );
}

/**
 * Kinage rule: severity (harm if true) is not priority (look now).
 * High harm + low confidence is Need more, not auto-clear and not auto-act.
 */
export function recommendDisposition(scores: Record<string, number>): DispositionKey {
  const harm = harmOf(scores);
  const confidence = confidenceOf(scores);
  const pressure = pressureOf(scores);
  if (harm >= 0.7 && confidence < 0.55) return "monitor";
  if (pressure < 0.35) return "dismiss";
  if (harm < 0.4 && confidence < 0.45) return "dismiss";
  if (pressure >= 0.65 && confidence >= 0.55) return "act";
  if (confidence < 0.5) return "monitor";
  return "act";
}

function actionFor(disposition: DispositionKey, current: string) {
  if (current && current !== UNMAPPED_ACTION) return current;
  if (disposition === "monitor") {
    return "Need more. Harm is high or the packet is incomplete. Do not auto-clear.";
  }
  if (disposition === "dismiss") {
    return "Low harm or known-legitimate. Label it so the queue does not keep charging the analyst.";
  }
  return "Take the next step in the packet. Do not wait for a cleaner export.";
}

function uncertaintyFor(item: CaseItem, gaps: string[], conflict: boolean) {
  const parts: string[] = [];
  if (item.uncertainty && item.uncertainty !== UNMAPPED_UNCERTAINTY) {
    parts.push(item.uncertainty);
  }
  if (gaps.length > 0) {
    parts.push(`Missing for a full decision: ${gaps.join(", ")}.`);
  }
  if (conflict) {
    parts.push("Source fields disagree with each other. Do not resolve by majority vote.");
  }
  if (parts.length === 0) {
    return "No material gaps in the packet. Still a human decision if money, safety, or a citation is in play.";
  }
  return parts.join(" ");
}

function whyFor(item: CaseItem, facts: { path: string; value: string }[]) {
  if (item.whyFlagged && item.whyFlagged !== UNMAPPED_WHY) return item.whyFlagged;
  const long = facts.find((fact) => fact.value.length > 40);
  if (long) return long.value;
  return facts
    .slice(0, 3)
    .map((fact) => fact.value)
    .join(" · ");
}

function mergeEvidence(base: Evidence[], extra: Evidence[]) {
  const seen = new Set(base.map((row) => `${row.label}|${row.detail}`));
  const merged = [...base];
  for (const row of extra) {
    const key = `${row.label}|${row.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged.slice(0, 12);
}

/**
 * Shallow mapping copies columns. Deepen reads the rest of the payload:
 * nested objects, related arrays, missing critical fields, and conflicts.
 */
export function deepen(
  item: CaseItem,
  raw: Record<string, unknown>,
  manifest: AdapterManifest
): CaseItem {
  const facts = flattenRecord(raw);
  const gaps = manifest.criticalFields.filter((field) => !present(raw, field));
  const coverage =
    manifest.criticalFields.length === 0
      ? 0
      : (manifest.criticalFields.length - gaps.length) / manifest.criticalFields.length;
  const conflict = hasConflictLanguage(facts);
  const recommendedDisposition = recommendDisposition(item.scores);

  return {
    ...item,
    facts,
    gaps,
    intakeCoverage: Math.round(coverage * 100) / 100,
    recommendedDisposition,
    whyFlagged: whyFor(item, facts),
    recommendedAction: actionFor(recommendedDisposition, item.recommendedAction),
    uncertainty: uncertaintyFor(item, gaps, conflict),
    evidence: mergeEvidence(item.evidence, relatedEvidence(raw)),
  };
}
