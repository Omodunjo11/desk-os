export type DeskId = "banking" | "regulatory" | "fraud" | "engineering";

export type PriorityBand = "P1" | "P2" | "P3";
export type Severity = "critical" | "high" | "moderate" | "low";
export type FieldType = "text" | "score" | "money" | "hours" | "badge" | "percent";
export type DispositionKey = "act" | "monitor" | "dismiss";
export type AdapterStatus = "demo" | "mapped" | "connected";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  inQueue: boolean;
  inCase: boolean;
};

export type RankingInput = {
  key: string;
  label: string;
  weight: number;
  hint: string;
};

export type DispositionDef = {
  key: DispositionKey;
  label: string;
  description: string;
};

export type Adapter = {
  id: string;
  name: string;
  system: string;
  plug: string;
};

export type Evidence = {
  label: string;
  detail: string;
};

export type Fact = {
  path: string;
  value: string;
};

export type CaseItem = {
  id: string;
  templateId: DeskId;
  title: string;
  subject: string;
  whyFlagged: string;
  recommendedAction: string;
  uncertainty: string;
  evidence: Evidence[];
  scores: Record<string, number>;
  values: Record<string, string | number>;
  recencyHours: number;
  /** Deep intake: every leaf we could read from the source payload. */
  facts?: Fact[];
  /** Judgment-critical source fields that were empty. */
  gaps?: string[];
  /** Fraction of critical fields present, 0 to 1. */
  intakeCoverage?: number;
  /** What the intake layer would do. Analyst can override. */
  recommendedDisposition?: DispositionKey;
};

export type ProcessTemplate = {
  id: DeskId;
  name: string;
  operator: string;
  industry: string;
  promise: string;
  adapter: Adapter;
  rankingLabel: string;
  rankingInputs: RankingInput[];
  fields: FieldDef[];
  dispositions: DispositionDef[];
  cases: CaseItem[];
};

export type ProcessCustomization = {
  hiddenFields: string[];
  weights: Record<string, number>;
  dispositionLabels: Record<DispositionKey, string>;
};

export type ProcessInstance = {
  id: string;
  templateId: DeskId;
  name: string;
  operator: string;
  createdAt: string;
};

export type LoggedDisposition = {
  caseId: string;
  processId: string;
  key: DispositionKey;
  note: string;
  at: string;
};
