/** Stable surface for the UI. Import from here rather than reaching into internals. */

export type {
  Adapter,
  CaseItem,
  DeskId,
  DispositionDef,
  DispositionKey,
  DisposeResult,
  Evidence,
  Fact,
  FieldDef,
  LoggedDisposition,
  PolicyHit,
  PolicyRule,
  PriorityBand,
  ProcessCustomization,
  ProcessInstance,
  ProcessTemplate,
  RankingInput,
  Severity,
  WritebackPayload,
} from "./types";

export { TEMPLATES, TEMPLATE_MAP } from "./templates";
export {
  band,
  formatField,
  formatScore,
  priorityScore,
  rankCases,
  recencyFactor,
  severityOf,
  weightedScore,
} from "./ranking";
export type { RankedCase } from "./ranking";
export {
  POLICY_BY_TEMPLATE,
  applyPolicyToDisposition,
  assertDisposition,
  classifyPolicy,
  noteRequiredFor,
  rulesFor,
} from "./policy";
export { stageWriteback } from "./writeback";
export { fingerprint, learnFactor, similarOutcomes } from "./learn";
export { formatAudit } from "./audit";
export {
  ADAPTERS,
  ADAPTER_MAP,
  CORE_BANKING,
  OPENPAGES,
  PLANT_OPS,
  TM_ALERTS,
  adaptersFor,
  normalizeBatch,
  normalizeRecord,
} from "./adapters";
export type { AdapterManifest, FieldRule, ScoreRule } from "./adapters";
export { detectFormat, ingestPayload, parseCsv, parseJsonPayload, validateRecords } from "./ingest";
export { ingestToCases } from "./pipeline";
export type { PipelineResult } from "./pipeline";
export { deepen, recommendDisposition } from "./deepen";
export { flattenRecord } from "./flatten";
export { DeskProvider, emptyCustom, useDesk, useProcess } from "./store";
