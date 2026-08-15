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

/** Data-driven matcher. Any set clause matching is enough; anyOf is OR. */
export type PolicyMatch = {
  titleIncludes?: string[];
  subjectIncludes?: string[];
  valueEquals?: { key: string; anyOf: string[] };
  valueIncludes?: { key: string; anyOf: string[] };
  scoreAtLeast?: { key: string; min: number };
};

/**
 * A lane that sits above weighted score.
 * Floor 0 is looked at first. Holds are not tickets.
 */
export type PolicyRule = {
  id: string;
  label: string;
  floor: number;
  hold: boolean;
  neverAutoDismiss: boolean;
  match: PolicyMatch;
};

export type PolicyHit = {
  id: string;
  label: string;
  floor: number;
  hold: boolean;
  neverAutoDismiss: boolean;
};

export type WritebackStatus = "staged" | "posted" | "failed";

export type WritebackPayload = {
  destination: string;
  sourceRecordId: string;
  field: string;
  value: string;
  note: string;
  overlayOnly: boolean;
  learns: boolean;
  status: WritebackStatus;
  /** Labels only. Never a funds-release or safety-clear command. */
  kind: "label";
  /** Operator-language asks when the label is Need more. Not source field keys. */
  asks?: string[];
  postedAt?: string;
  error?: string;
};

export type PacketNode = {
  kind: string;
  id: string;
  label: string;
  status?: string;
  children?: PacketNode[];
};

export type ConnectorConfig = {
  adapterId: string;
  url: string;
  lastPulledAt?: string;
  lastError?: string;
};

export type WorkspaceMeta = {
  id: string;
  key: string;
  name: string;
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
  /** Issue → control → test → asset (or txn/lot siblings). Overlay, not GRC. */
  packet?: PacketNode;
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
  /** Optional override. Default lanes live in policy.ts per template. */
  policyRules?: PolicyRule[];
  cases: CaseItem[];
};

export type ProcessCustomization = {
  hiddenFields: string[];
  weights: Record<string, number>;
  dispositionLabels: Record<DispositionKey, string>;
  policyRules?: PolicyRule[];
  connector?: ConnectorConfig;
  writebackUrl?: string;
  writebackEnabled?: boolean;
  shiftCapacity?: number;
};

export type ProcessInstance = {
  id: string;
  templateId: DeskId;
  name: string;
  operator: string;
  createdAt: string;
};

export type WorkspaceSnapshot = {
  processes: ProcessInstance[];
  customizations: Record<string, ProcessCustomization>;
  ledger: LoggedDisposition[];
  casesByProcess: Record<string, CaseItem[]>;
};

export type LoggedDisposition = {
  caseId: string;
  processId: string;
  key: DispositionKey;
  note: string;
  at: string;
  policyId?: string;
  policyLabel?: string;
  writeback?: WritebackPayload;
  /** Who still owns a parked / Need more case. Overlay only. */
  owner?: string;
};

export type DisposeResult =
  | { ok: true; entry: LoggedDisposition }
  | { ok: false; reason: string };
