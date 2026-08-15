import type { WorkspaceSnapshot } from "./types";
import type { WritebackPayload } from "./types";

export type StoredWorkspace = {
  id: string;
  key: string;
  name: string;
  snapshot: WorkspaceSnapshot;
  updatedAt: string;
};

export type ReceivedLabel = {
  at: string;
  payload: Pick<
    WritebackPayload,
    "destination" | "sourceRecordId" | "field" | "value" | "note" | "overlayOnly" | "kind" | "asks"
  >;
};

type Memory = {
  workspaces: Map<string, StoredWorkspace>;
  labels: ReceivedLabel[];
};

function memory(): Memory {
  const g = globalThis as typeof globalThis & { __deskMemory?: Memory };
  if (!g.__deskMemory) {
    g.__deskMemory = { workspaces: new Map(), labels: [] };
  }
  return g.__deskMemory;
}

export function putWorkspace(row: StoredWorkspace) {
  memory().workspaces.set(row.id, row);
}

export function getWorkspace(id: string) {
  return memory().workspaces.get(id);
}

export function pushLabel(row: ReceivedLabel) {
  const mem = memory();
  mem.labels = [row, ...mem.labels].slice(0, 200);
}

export function listLabels() {
  return memory().labels;
}
