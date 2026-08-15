/** Stable surface for the UI. Import from here rather than reaching into internals. */

export type {
  Adapter,
  CaseItem,
  ConnectorConfig,
  DeskId,
  DispositionDef,
  DispositionKey,
  DisposeResult,
  Evidence,
  Fact,
  FieldDef,
  LoggedDisposition,
  PacketNode,
  PolicyHit,
  PolicyRule,
  PriorityBand,
  ProcessCustomization,
  ProcessInstance,
  ProcessTemplate,
  RankingInput,
  Severity,
  WorkspaceMeta,
  WorkspaceSnapshot,
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
  isLockedRule,
  lockedRuleIds,
  mergePolicyRules,
  noteRequiredFor,
  rulesFor,
  isClosedDisposition,
  assertPark,
} from "./policy";
export { postWriteback, stageWriteback } from "./writeback";
export { asksAreOperatorLanguage, isNeedMore, packetAsks } from "./gaps";
export type { PacketAsk } from "./gaps";
export { answerChat, routeIntent } from "./chat";
export type { ChatIntent, ChatReply, ChatWorld } from "./chat";
export { fingerprint, fingerprintLabel, formatOverridePack, learnFactor, overrideReview, sampleWeekPlan, similarOutcomes } from "./learn";
export type { OverrideAdvice, OverrideBucket } from "./learn";
export { formatAudit } from "./audit";
export { packetFromRaw } from "./packet";
export { DEFAULT_SHIFT_CAPACITY, MINUTES_PER_CASE, shiftClock } from "./shift";
export type { ShiftClock } from "./shift";
export { DEMO_FEEDS, isSafePullUrl, pullToCases } from "./connectors";
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
