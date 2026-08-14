import type { CaseItem, DispositionKey, DraftedAction, ProcessTemplate } from "./types";

/**
 * Happy path = confident enough to draft on: coverage is full, nothing
 * contradicts, and intake didn't already call for "monitor" (need more).
 * Mirrors the Kinage rule in deepen.ts: never let the agent touch a
 * high-harm/low-confidence case.
 */
export function isHappyPath(item: CaseItem): boolean {
  if (!item.recommendedDisposition || item.recommendedDisposition === "monitor") return false;
  if (item.hasConflict) return false;
  if (item.gaps && item.gaps.length > 0) return false;
  return true;
}

export function reasonNotEligible(item: CaseItem): string | null {
  if (isHappyPath(item)) return null;
  if (item.recommendedDisposition === "monitor") {
    return "Needs a human: high harm or low confidence, not a call to auto-draft.";
  }
  if (item.hasConflict) {
    return "Source fields disagree with each other. An agent should not resolve that by guessing.";
  }
  if (item.gaps && item.gaps.length > 0) {
    return `Packet is incomplete (missing: ${item.gaps.join(", ")}). Needs a human to fill the gap first.`;
  }
  return "Not eligible for an agent draft yet.";
}

function dispositionLabel(template: ProcessTemplate, key: DispositionKey): string {
  return template.dispositions.find((d) => d.key === key)?.label ?? key;
}

/**
 * Stand-in for a real drafting call. Deterministic, template-driven (no
 * per-vertical branching) so swapping in an LLM later is a body swap, not
 * a rewrite: same inputs (facts, evidence, disposition), same shape out.
 */
export function draftActionStub(item: CaseItem, template: ProcessTemplate): DraftedAction {
  const key = item.recommendedDisposition ?? "monitor";
  const steps: string[] = [];

  steps.push(`Confirm: ${item.whyFlagged}`);

  item.evidence.slice(0, 3).forEach((e) => {
    steps.push(`Check ${e.label}: ${e.detail}`);
  });

  steps.push(`${dispositionLabel(template, key)}: ${item.recommendedAction}`);
  steps.push(
    `Log the disposition with a note citing packet coverage (${Math.round(
      (item.intakeCoverage ?? 1) * 100
    )}%).`
  );

  return {
    summary: `${dispositionLabel(template, key)} — drafted from ${item.evidence.length} evidence item${
      item.evidence.length === 1 ? "" : "s"
    } and full intake coverage.`,
    steps,
    generatedAt: new Date().toISOString(),
    source: "stub",
  };
}
