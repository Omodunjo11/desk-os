import { ADAPTERS, type AdapterManifest } from "./adapters";
import type { CaseItem, DispositionKey, WritebackPayload } from "./types";

export type WritebackSpec = {
  destination: string;
  statusField: string;
  status: Record<DispositionKey, string>;
  overlayOnly: boolean;
  learns: boolean;
};

const WRITEBACK: Record<string, WritebackSpec> = {
  "core-banking": {
    destination: "FIS / Jack Henry / payments hub",
    statusField: "exception_status",
    status: {
      act: "RELEASE_REVIEWED",
      monitor: "HOLD_PENDING_EVIDENCE",
      dismiss: "NOT_AN_EXCEPTION",
    },
    overlayOnly: true,
    learns: false,
  },
  openpages: {
    destination: "IBM OpenPages",
    statusField: "OPSS-Iss:WorkflowStatus",
    status: {
      act: "OPEN_OBLIGATION",
      monitor: "WATCH",
      dismiss: "OUT_OF_PERIMETER",
    },
    overlayOnly: true,
    learns: false,
  },
  "tm-alerts": {
    destination: "Actimize / Falcon / TM",
    statusField: "alert_label",
    status: {
      act: "TRUE_POSITIVE",
      monitor: "NEED_MORE",
      dismiss: "FALSE_POSITIVE",
    },
    overlayOnly: true,
    learns: true,
  },
  "plant-ops": {
    destination: "MES / PI / TrackWise",
    statusField: "event_disposition",
    status: {
      act: "INTERVENE",
      monitor: "WATCH",
      dismiss: "IN_CONTROL",
    },
    overlayOnly: true,
    learns: true,
  },
};

function manifestFor(item: CaseItem): AdapterManifest | undefined {
  return ADAPTERS.find((adapter) => adapter.defaultTemplateId === item.templateId);
}

function sourceId(item: CaseItem) {
  const prefixed = item.id.split(":").pop() ?? item.id;
  const manifest = manifestFor(item);
  if (!manifest) return prefixed;
  return prefixed.replace(new RegExp(`^${manifest.id}-`), "");
}

/** Stage a label the source system can learn from. Desk does not become the system of record. */
export function stageWriteback(
  item: CaseItem,
  key: DispositionKey,
  note: string
): WritebackPayload | undefined {
  const manifest = manifestFor(item);
  const spec = manifest ? WRITEBACK[manifest.id] : undefined;
  if (!spec) return undefined;
  return {
    destination: spec.destination,
    sourceRecordId: sourceId(item),
    field: spec.statusField,
    value: spec.status[key],
    note: note.trim(),
    overlayOnly: spec.overlayOnly,
    learns: spec.learns,
    status: "staged",
  };
}
