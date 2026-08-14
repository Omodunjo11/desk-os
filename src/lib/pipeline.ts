import { normalizeRecord, type AdapterManifest } from "./adapters";
import { deepen } from "./deepen";
import { ingestPayload } from "./ingest";
import type { CaseItem } from "./types";

export type PipelineResult = {
  ok: boolean;
  cases: CaseItem[];
  records: Record<string, unknown>[];
  errors: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Paste from a source system → CaseItems the queue can rank. Walks nested payloads. Never throws. */
export function ingestToCases(text: string, manifest: AdapterManifest): PipelineResult {
  const parsed = ingestPayload(text, manifest.required);
  if (!parsed.ok) {
    return { ok: false, cases: [], records: parsed.records, errors: parsed.errors };
  }
  const cases = parsed.records.filter(isRecord).map((raw, index) =>
    deepen(normalizeRecord(raw, manifest, index), raw, manifest)
  );
  return {
    ok: cases.length > 0,
    cases,
    records: parsed.records,
    errors: parsed.errors,
  };
}
