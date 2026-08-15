import type { CaseItem, DeskId, DispositionKey, LoggedDisposition, ProcessInstance } from "./types";

/** Coarse fingerprint so similar false positives can downweight the next row — never auto-clear it. */
export function fingerprint(item: CaseItem): string {
  const v = item.values;
  const lane =
    v.typology ?? v.product ?? v.type ?? v.citation ?? v.rule ?? "untyped";
  return `${item.templateId}:${String(lane).toLowerCase()}`;
}

export function fingerprintLabel(key: string) {
  const parts = key.split(":");
  return parts.slice(1).join(":") || key;
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

export type OverrideAdvice = "retune" | "need-more" | "keep-working" | "do-not-touch";

export type OverrideBucket = {
  key: string;
  label: string;
  templateId: DeskId;
  n: number;
  dismissed: number;
  monitored: number;
  acted: number;
  noiseRate: number;
  holdCount: number;
  recommendation: OverrideAdvice;
  reason: string;
  sampleCaseIds: string[];
  labels: string[];
};

function isHoldEntry(row: LoggedDisposition) {
  if (row.policyId && /hold|sanctions|mria|elder|vulnerable|genealogy|safety|payroll/i.test(row.policyId)) {
    return true;
  }
  return Boolean(row.policyLabel && /hold|sanctions|mria|elder|vulnerable/i.test(row.policyLabel));
}

function advise(
  bucket: Omit<OverrideBucket, "recommendation" | "reason">
): Pick<OverrideBucket, "recommendation" | "reason"> {
  if (bucket.holdCount > 0) {
    return {
      recommendation: "do-not-touch",
      reason: "A hold or vulnerable-party lane is in this bucket. Weekly override must not auto-clear it.",
    };
  }
  if (bucket.dismissed >= 3 && bucket.acted === 0) {
    return {
      recommendation: "retune",
      reason: "Three or more clears, no true positives. Candidate for the weekly TM / rule override review.",
    };
  }
  if (bucket.monitored >= Math.max(2, Math.ceil(bucket.n / 2))) {
    return {
      recommendation: "need-more",
      reason: "Analysts keep asking for more. Do not tighten the rule; fix the packet.",
    };
  }
  return {
    recommendation: "keep-working",
    reason: "Not enough of a pattern yet. Keep labeling.",
  };
}

/** Weekly override review: group ledger by typology so the source system can learn. */
export function overrideReview(
  ledger: LoggedDisposition[],
  casesByProcess: Record<string, CaseItem[]>,
  processes: ProcessInstance[]
): OverrideBucket[] {
  const caseMap = new Map<string, CaseItem>();
  for (const cases of Object.values(casesByProcess)) {
    for (const item of cases) {
      caseMap.set(item.id, item);
    }
  }

  const groups = new Map<string, LoggedDisposition[]>();
  for (const row of ledger) {
    const item = caseMap.get(row.caseId);
    if (!item) continue;
    const key = fingerprint(item);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const processById = Object.fromEntries(processes.map((p) => [p.id, p]));
  const buckets: OverrideBucket[] = [];

  for (const [key, rows] of groups) {
    const sample = caseMap.get(rows[0].caseId);
    const templateId = sample?.templateId ?? processById[rows[0].processId]?.templateId ?? "fraud";
    const dismissed = rows.filter((r) => r.key === "dismiss").length;
    const monitored = rows.filter((r) => r.key === "monitor").length;
    const acted = rows.filter((r) => r.key === "act").length;
    const partial = {
      key,
      label: fingerprintLabel(key),
      templateId,
      n: rows.length,
      dismissed,
      monitored,
      acted,
      noiseRate: rows.length === 0 ? 0 : dismissed / rows.length,
      holdCount: rows.filter(isHoldEntry).length,
      sampleCaseIds: [...new Set(rows.map((r) => r.caseId))].slice(0, 6),
      labels: [...new Set(rows.map((r) => r.writeback?.value).filter((v): v is string => Boolean(v)))],
    };
    buckets.push({ ...partial, ...advise(partial) });
  }

  const order: Record<OverrideAdvice, number> = {
    retune: 0,
    "do-not-touch": 1,
    "need-more": 2,
    "keep-working": 3,
  };
  return buckets.sort((a, b) => order[a.recommendation] - order[b.recommendation] || b.n - a.n);
}

export function formatOverridePack(buckets: OverrideBucket[], generatedAt = new Date().toISOString()) {
  return JSON.stringify(
    {
      product: "Desk",
      purpose: "Weekly override review — labels for the source system, not a new system of record",
      generatedAt,
      retune: buckets
        .filter((b) => b.recommendation === "retune")
        .map((b) => ({
          pattern: b.label,
          n: b.n,
          dismissed: b.dismissed,
          noiseRate: Math.round(b.noiseRate * 100) / 100,
          suggestedLabel: "FALSE_POSITIVE",
          sampleCaseIds: b.sampleCaseIds,
        })),
      doNotTouch: buckets
        .filter((b) => b.recommendation === "do-not-touch")
        .map((b) => ({ pattern: b.label, n: b.n, reason: b.reason })),
      needMore: buckets
        .filter((b) => b.recommendation === "need-more")
        .map((b) => ({ pattern: b.label, n: b.n, reason: b.reason })),
    },
    null,
    2
  );
}

export type SampleWeekOp = {
  extraCases: { processId: string; cases: CaseItem[] };
  dispositions: { processId: string; caseId: string; key: DispositionKey; note: string; owner?: string }[];
};

/** Demo week: three mule clears, elders stay Need more, one ATO escalates. */
export function sampleWeekPlan(processId: string, cases: CaseItem[]): SampleWeekOp | null {
  const mule = cases.find((c) => fingerprint(c) === "fraud:mule");
  const elder = cases.filter((c) => fingerprint(c).startsWith("fraud:elder"));
  const ato = cases.find((c) => fingerprint(c) === "fraud:ato");
  const vendor = cases.find((c) => fingerprint(c).includes("duplicate vendor"));
  if (!mule) return null;

  const clones: CaseItem[] = [1, 2].map((n) => ({
    ...mule,
    id: `${processId}:sample-mule-${n}`,
    title: `${mule.title} (repeat ${n})`,
    scores: { ...mule.scores },
    values: { ...mule.values },
    evidence: mule.evidence.map((e) => ({ ...e })),
  }));

  const dispositions: SampleWeekOp["dispositions"] = [
    {
      processId,
      caseId: mule.id,
      key: "dismiss",
      note: "Sample week: known-legitimate / false positive.",
    },
    ...clones.map((c) => ({
      processId,
      caseId: c.id,
      key: "dismiss" as const,
      note: "Sample week: same mule typology, labeled noise.",
    })),
    ...elder.map((c) => ({
      processId,
      caseId: c.id,
      key: "monitor" as const,
      note: "Sample week: Need more. Do not retune elder rules off.",
      owner: "Elder specialist",
    })),
  ];
  if (ato) {
    dispositions.push({
      processId,
      caseId: ato.id,
      key: "act",
      note: "Sample week: true positive, escalate.",
    });
  }
  if (vendor) {
    dispositions.push({
      processId,
      caseId: vendor.id,
      key: "dismiss",
      note: "Sample week: fuzzy vendor, known pair.",
    });
  }

  return { extraCases: { processId, cases: clones }, dispositions };
}
