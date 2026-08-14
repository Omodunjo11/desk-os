/** Stable surface for the UI. Import from here rather than reaching into internals. */

export type {
  Adapter,
  CaseItem,
  DeskId,
  DispositionDef,
  DispositionKey,
  DraftedAction,
  Evidence,
  Fact,
  FieldDef,
  LoggedDisposition,
  PriorityBand,
  ProcessCustomization,
  ProcessInstance,
  ProcessTemplate,
  RankingInput,
  Severity,
} from "./types";
export { draftActionStub, isHappyPath, reasonNotEligible } from "./actions";

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
