import type { CaseItem, DeskId } from "@/lib/types";

/**
 * An adapter is the contract between a foreign system and a Desk process.
 *
 * Everything about the mapping lives in data, not in code. A team that renames
 * a column in their source export edits the manifest, not this file.
 */

/** Where a source field lands on a CaseItem: "title", "values.amount", "recencyHours". */
export type FieldTarget = string;

export type FieldRule = {
  to: FieldTarget;
  /** text = coerce to string, number = coerce to number, hoursSince = age of a timestamp in hours. */
  as?: "text" | "number" | "hoursSince";
  /** Translate source codes into operator language: { WIRE: "Wire" }. */
  map?: Record<string, string | number>;
  /** Used when the source field is missing or empty. */
  fallback?: string | number;
};

export type ScoreRule = {
  /** Key inside CaseItem.scores. Must match a rankingInput key on the template. */
  to: string;
  /** Divide numeric input by this before clamping. Defaults to 1 (already 0 to 1). */
  max?: number;
  /** Use for fields where a smaller number means more pressure, such as hours left. */
  invert?: boolean;
  /** Translate labels a source system emits: { High: 0.8, Critical: 0.95 }. */
  bands?: Record<string, number>;
  fallback?: number;
};

/** Shorthand "values.amount" or a full rule. */
export type FieldSpec = string | FieldRule;

/** Provenance the analyst sees on the case. Nothing is invented, it is quoted from the source row. */
export type EvidenceRule = {
  label: string;
  from: string;
};

export type AdapterManifest = {
  id: string;
  /** Human name of the connector. */
  name: string;
  /** System of record it reads from. */
  system: string;
  vertical: DeskId;
  defaultTemplateId: DeskId;
  /** What Desk reads and what it does not write. */
  plug: string;
  /** Source field carrying a stable record id. */
  idField: string;
  /** Keys a record must carry to be worth normalizing. */
  required: string[];
  /** Fields a human needs to make a decision. Missing ones become gaps. */
  criticalFields: string[];
  /** Source field to one or more CaseItem targets. */
  fieldMap: Record<string, FieldSpec | FieldSpec[]>;
  scoreMap: Record<string, string | ScoreRule>;
  evidenceMap: EvidenceRule[];
};

const TEXT_FIELDS = [
  "id",
  "title",
  "subject",
  "whyFlagged",
  "recommendedAction",
  "uncertainty",
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

export const UNMAPPED_TITLE = "Unmapped record";
export const UNMAPPED_ACTION =
  "Review in the source system until an action field is mapped.";
export const UNMAPPED_WHY =
  "No reason field is mapped yet. Point fieldMap at the column that carries it.";
export const UNMAPPED_UNCERTAINTY =
  "Mapping is incomplete, so confidence in this row is unknown.";

function isTextField(key: string): key is TextField {
  return (TEXT_FIELDS as readonly string[]).includes(key);
}

/** Direct key first so source systems with dots or colons in column names still work. */
export function readPath(raw: Record<string, unknown>, path: string): unknown {
  if (path in raw) return raw[path];
  let cursor: unknown = raw;
  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,%\s]/g, "").replace(/,/g, "");
    if (cleaned.length === 0) return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function hoursSince(value: unknown, now: number): number | undefined {
  const text = toText(value);
  if (!text) return undefined;
  const stamp = Date.parse(text);
  if (Number.isNaN(stamp)) return undefined;
  const hours = (now - stamp) / 3_600_000;
  return Math.max(0, Math.round(hours * 10) / 10);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function assign(item: CaseItem, target: FieldTarget, value: string | number): void {
  if (target.startsWith("values.")) {
    item.values[target.slice("values.".length)] = value;
    return;
  }
  if (target.startsWith("scores.")) {
    const numeric = toNumber(value);
    if (numeric !== undefined) item.scores[target.slice("scores.".length)] = clamp01(numeric);
    return;
  }
  if (target === "recencyHours") {
    const numeric = toNumber(value);
    if (numeric !== undefined) item.recencyHours = Math.max(0, numeric);
    return;
  }
  if (isTextField(target)) {
    const text = toText(value);
    if (text) item[target] = text;
  }
}

function blankCase(manifest: AdapterManifest, index: number): CaseItem {
  return {
    id: `${manifest.id}-${index + 1}`,
    templateId: manifest.defaultTemplateId,
    title: UNMAPPED_TITLE,
    subject: manifest.system,
    whyFlagged: UNMAPPED_WHY,
    recommendedAction: UNMAPPED_ACTION,
    uncertainty: UNMAPPED_UNCERTAINTY,
    evidence: [],
    scores: {},
    values: {},
    recencyHours: 0,
  };
}

function applyField(
  item: CaseItem,
  raw: Record<string, unknown>,
  source: string,
  rule: FieldSpec,
  now: number
): void {
  const spec: FieldRule = typeof rule === "string" ? { to: rule } : rule;
  const value = readPath(raw, source);

  if (spec.as === "hoursSince") {
    const hours = hoursSince(value, now);
    if (hours !== undefined) assign(item, spec.to, hours);
    else if (spec.fallback !== undefined) assign(item, spec.to, spec.fallback);
    return;
  }

  const key = toText(value);
  if (key !== undefined && spec.map && key in spec.map) {
    assign(item, spec.to, spec.map[key]);
    return;
  }

  if (spec.as === "number") {
    const numeric = toNumber(value);
    if (numeric !== undefined) assign(item, spec.to, numeric);
    else if (spec.fallback !== undefined) assign(item, spec.to, spec.fallback);
    return;
  }

  if (key !== undefined) assign(item, spec.to, key);
  else if (spec.fallback !== undefined) assign(item, spec.to, spec.fallback);
}

function applyScore(
  item: CaseItem,
  raw: Record<string, unknown>,
  source: string,
  rule: string | ScoreRule
): void {
  const spec: ScoreRule = typeof rule === "string" ? { to: rule } : rule;
  const value = readPath(raw, source);
  const label = toText(value);

  if (label !== undefined && spec.bands && label in spec.bands) {
    item.scores[spec.to] = clamp01(spec.bands[label]);
    return;
  }

  const numeric = toNumber(value);
  if (numeric === undefined) {
    if (spec.fallback !== undefined) item.scores[spec.to] = clamp01(spec.fallback);
    return;
  }

  const scaled = clamp01(numeric / (spec.max ?? 1));
  item.scores[spec.to] = spec.invert ? clamp01(1 - scaled) : scaled;
}

/** One raw source row becomes one CaseItem. Unmapped parts stay honest rather than guessed. */
export function normalizeRecord(
  raw: Record<string, unknown>,
  manifest: AdapterManifest,
  index = 0,
  now: number = Date.now()
): CaseItem {
  const item = blankCase(manifest, index);

  const sourceId = toText(readPath(raw, manifest.idField));
  if (sourceId) item.id = `${manifest.id}-${sourceId}`;

  for (const [source, rule] of Object.entries(manifest.fieldMap)) {
    const specs = Array.isArray(rule) ? rule : [rule];
    for (const spec of specs) applyField(item, raw, source, spec, now);
  }

  for (const [source, rule] of Object.entries(manifest.scoreMap)) {
    applyScore(item, raw, source, rule);
  }

  for (const rule of manifest.evidenceMap) {
    const detail = toText(readPath(raw, rule.from));
    if (detail) item.evidence.push({ label: rule.label, detail });
  }

  return item;
}

export function normalizeBatch(
  raws: Record<string, unknown>[],
  manifest: AdapterManifest,
  now: number = Date.now()
): CaseItem[] {
  return raws.map((raw, index) => normalizeRecord(raw, manifest, index, now));
}

export const CORE_BANKING: AdapterManifest = {
  id: "core-banking",
  name: "Core + payments + CRM",
  system: "FIS / Jack Henry / Salesforce",
  vertical: "banking",
  defaultTemplateId: "banking",
  plug: "Read holds, KYC timers, and relationship value. No write-back until the bank signs off.",
  idField: "hold_id",
  required: ["hold_id", "party_name", "amount_usd"],
  criticalFields: [
    "hold_id",
    "party_name",
    "amount_usd",
    "reason_detail",
    "next_step",
    "open_questions",
    "screening_score",
  ],
  fieldMap: {
    hold_reason: {
      to: "title",
      map: {
        OFAC_NEAR_MATCH: "Outgoing wire held on sanctions near-match",
        KYC_REFRESH_OVERDUE: "KYC refresh overdue on a live credit line",
        DUPLICATE_PAYMENT: "Possible duplicate vendor payment",
        NSF_PAYROLL: "Payroll standing order short of collected funds",
      },
      fallback: "Payment exception",
    },
    party_name: "subject",
    reason_detail: "whyFlagged",
    next_step: "recommendedAction",
    open_questions: "uncertainty",
    product_code: {
      to: "values.product",
      map: { WIRE: "Wire", ACH: "ACH", CREDIT: "Credit", DDA: "Deposits" },
    },
    amount_usd: { to: "values.amount", as: "number" },
    cutoff_hours: { to: "values.sla", as: "number" },
    segment: "values.segment",
    source_system: "values.source",
    posted_at: { to: "recencyHours", as: "hoursSince", fallback: 0 },
  },
  scoreMap: {
    amount_usd: { to: "exposure", max: 1_000_000 },
    cutoff_hours: { to: "urgency", max: 24, invert: true, fallback: 0.5 },
    segment: {
      to: "customer",
      bands: { Commercial: 0.8, Consumer: 0.5, SMB: 0.55, Trust: 0.5, "Corporate AP": 0.35 },
      fallback: 0.5,
    },
    screening_score: { to: "confidence", max: 100, fallback: 0.6 },
  },
  evidenceMap: [
    { label: "Hold", from: "reason_detail" },
    { label: "Relationship", from: "relationship_summary" },
    { label: "Queue", from: "queue" },
  ],
};

export const OPENPAGES: AdapterManifest = {
  id: "openpages",
  name: "IBM OpenPages + regulator feeds",
  system: "IBM OpenPages / GRC",
  vertical: "regulatory",
  defaultTemplateId: "regulatory",
  plug: "Obligations, controls, and issues stay in OpenPages. Desk ranks what the analyst opens today.",
  idField: "resourceId",
  required: ["resourceId", "OPSS-Iss:Name"],
  criticalFields: [
    "resourceId",
    "OPSS-Iss:Name",
    "OPSS-Iss:Description",
    "OPSS-Iss:Severity",
    "OPSS-Iss:Owner",
    "OPSS-Iss:EvidenceStatus",
    "OPSS-Iss:Recommendation",
  ],
  fieldMap: {
    "OPSS-Iss:Name": "title",
    "OPSS-Iss:Citation": ["subject", "values.citation"],
    "OPSS-Iss:Description": "whyFlagged",
    "OPSS-Iss:Recommendation": "recommendedAction",
    "OPSS-Iss:OpenQuestion": "uncertainty",
    "OPSS-Iss:Owner": { to: "values.owner", fallback: "Unassigned" },
    "OPSS-Iss:DueDate": "values.deadline",
    businessEntity: "values.bu",
    system: { to: "values.system", fallback: "IBM OpenPages" },
    createdOn: { to: "recencyHours", as: "hoursSince", fallback: 0 },
  },
  scoreMap: {
    "OPSS-Iss:Severity": {
      to: "harm",
      bands: { Critical: 0.95, High: 0.85, Medium: 0.6, Low: 0.35 },
      fallback: 0.5,
    },
    scopeConfidence: { to: "applicability", max: 100, fallback: 0.6 },
    daysToDue: { to: "deadline", max: 90, invert: true, fallback: 0.5 },
    "OPSS-Iss:EvidenceStatus": {
      to: "gap",
      bands: { Missing: 0.95, Stale: 0.8, Partial: 0.6, Current: 0.2 },
      fallback: 0.5,
    },
  },
  evidenceMap: [
    { label: "OpenPages", from: "parentControl" },
    { label: "Last tested", from: "lastTested" },
    { label: "Status", from: "OPSS-Iss:Status" },
  ],
};

export const TM_ALERTS: AdapterManifest = {
  id: "tm-alerts",
  name: "Transaction monitoring",
  system: "Actimize / Falcon / in-house TM",
  vertical: "fraud",
  defaultTemplateId: "fraud",
  plug: "Ingest alerts read-only. Analyst dispositions write back as labels for the weekly override review.",
  idField: "alertId",
  required: ["alertId", "alertType", "focalParty"],
  criticalFields: [
    "alertId",
    "focalParty",
    "narrative",
    "riskScore",
    "modelConfidence",
    "analystNextStep",
    "openQuestion",
  ],
  fieldMap: {
    policyName: { to: "title", fallback: "Transaction monitoring alert" },
    focalParty: "subject",
    narrative: "whyFlagged",
    analystNextStep: "recommendedAction",
    openQuestion: "uncertainty",
    alertType: {
      to: "values.typology",
      map: {
        ELDER_EXPLOITATION: "Elder / exploitation",
        ACCOUNT_TAKEOVER: "ATO",
        MULE_PASSTHROUGH: "Mule",
        CARD_TESTING: "Card testing",
      },
      fallback: "Unclassified",
    },
    txnAmountUsd: { to: "values.amount", as: "number" },
    alertAgeHours: { to: "values.age", as: "number" },
    channel: "values.channel",
    ruleId: "values.rule",
    alertCreatedTs: { to: "recencyHours", as: "hoursSince", fallback: 0 },
  },
  scoreMap: {
    riskScore: { to: "harm", max: 100, fallback: 0.5 },
    modelConfidence: { to: "confidence", max: 100, fallback: 0.5 },
    velocityScore: { to: "velocity", max: 100, fallback: 0.4 },
    vulnerabilityScore: { to: "customer", max: 100, fallback: 0.3 },
  },
  evidenceMap: [
    { label: "Rule", from: "policyName" },
    { label: "Party", from: "partyProfile" },
    { label: "History", from: "priorDispositionSummary" },
  ],
};

export const PLANT_OPS: AdapterManifest = {
  id: "plant-ops",
  name: "MES + historian + LIMS + QMS",
  system: "OSIsoft PI / MES / TrackWise",
  vertical: "engineering",
  defaultTemplateId: "engineering",
  plug: "Tags, batches, and CAPAs map into one case. Writes go back as dispositions, not as a new system of record.",
  idField: "eventId",
  required: ["eventId", "assetPath", "eventType"],
  criticalFields: [
    "eventId",
    "assetPath",
    "detail",
    "recommendation",
    "safetyBand",
    "signalConfidencePct",
    "openQuestion",
  ],
  fieldMap: {
    summary: { to: "title", fallback: "Process deviation" },
    assetPath: "subject",
    detail: "whyFlagged",
    recommendation: "recommendedAction",
    openQuestion: "uncertainty",
    assetName: "values.asset",
    estLossUsd: { to: "values.loss", as: "number", fallback: 0 },
    windowHours: { to: "values.window", as: "number" },
    eventType: {
      to: "values.type",
      map: {
        FLOOD_RISK: "Bottleneck",
        SPC_SHIFT: "Quality",
        MOC_OPEN: "Change control",
        CAPA_OVERDUE: "CAPA",
      },
      fallback: "Deviation",
    },
    sourceSystem: "values.source",
    detectedAt: { to: "recencyHours", as: "hoursSince", fallback: 0 },
  },
  scoreMap: {
    safetyBand: {
      to: "safety",
      bands: { Critical: 0.95, High: 0.78, Moderate: 0.55, Low: 0.25 },
      fallback: 0.5,
    },
    estLossUsd: { to: "loss", max: 250_000, fallback: 0.2 },
    constraintHours: { to: "constraint", max: 24, invert: true, fallback: 0.5 },
    signalConfidencePct: { to: "confidence", max: 100, fallback: 0.6 },
  },
  evidenceMap: [
    { label: "Historian", from: "tagName" },
    { label: "Operator", from: "operatorNote" },
    { label: "Quality", from: "qmsReference" },
  ],
};

export const ADAPTERS: AdapterManifest[] = [CORE_BANKING, OPENPAGES, TM_ALERTS, PLANT_OPS];

export const ADAPTER_MAP: Record<string, AdapterManifest> = Object.fromEntries(
  ADAPTERS.map((adapter) => [adapter.id, adapter])
);

export function adaptersFor(vertical: DeskId): AdapterManifest[] {
  return ADAPTERS.filter((adapter) => adapter.vertical === vertical);
}
