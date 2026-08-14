import type { Fact } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function leaf(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return undefined;
}

/** Walk a source payload. Nested objects and arrays become dotted / indexed paths. */
export function flattenRecord(
  raw: Record<string, unknown>,
  prefix = "",
  out: Fact[] = [],
  depth = 0
): Fact[] {
  if (depth > 6 || out.length >= 80) return out;

  for (const [key, value] of Object.entries(raw)) {
    if (out.length >= 80) break;
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      const scalars = value.map(leaf).filter((v): v is string => v !== undefined);
      if (scalars.length === value.length) {
        if (scalars.length > 0) out.push({ path, value: scalars.join(", ") });
        continue;
      }
      value.forEach((item, index) => {
        if (isRecord(item)) flattenRecord(item, `${path}[${index}]`, out, depth + 1);
        else {
          const text = leaf(item);
          if (text) out.push({ path: `${path}[${index}]`, value: text });
        }
      });
      continue;
    }

    if (isRecord(value)) {
      flattenRecord(value, path, out, depth + 1);
      continue;
    }

    const text = leaf(value);
    if (text) out.push({ path, value: text });
  }

  return out;
}

export function relatedEvidence(raw: Record<string, unknown>) {
  const evidence: { label: string; detail: string }[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue;
    const rows = value.filter(isRecord).slice(0, 6);
    rows.forEach((row, index) => {
      const detail = Object.entries(row)
        .slice(0, 5)
        .map(([k, v]) => {
          const text = leaf(v);
          return text ? `${k}: ${text}` : undefined;
        })
        .filter((part): part is string => Boolean(part))
        .join(" · ");
      if (detail) evidence.push({ label: `${key} ${index + 1}`, detail });
    });
  }

  return evidence;
}

export function hasConflictLanguage(facts: Fact[]) {
  return facts.some((fact) =>
    /mismatch|disagree|conflict|vs\.| versus /i.test(`${fact.path} ${fact.value}`)
  );
}
