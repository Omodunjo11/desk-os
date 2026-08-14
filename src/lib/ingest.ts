/**
 * Ingest is deliberately forgiving. An operator pastes an export from a system
 * nobody documented, and Desk answers with rows or with reasons. It never throws.
 */

export type PayloadFormat = "json" | "csv" | "empty";

export type IngestResult = {
  ok: boolean;
  records: Record<string, unknown>[];
  errors: string[];
};

/** Returns undefined instead of throwing when the text is not JSON. */
export function parseJsonPayload(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/** Handles quoted fields, escaped quotes, commas inside quotes, and CRLF. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitCsvRows(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((cell) => cell.trim());
  const records: Record<string, string>[] = [];

  for (const row of rows.slice(1)) {
    if (row.every((cell) => cell.trim().length === 0)) continue;
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      if (key.length === 0) return;
      record[key] = (row[index] ?? "").trim();
    });
    records.push(record);
  }

  return records;
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export function detectFormat(text: string): PayloadFormat {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "empty";
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "json";
  return "csv";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValue(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/** Checks that every record carries the keys the adapter cannot work without. */
export function validateRecords(
  records: Record<string, unknown>[],
  required: string[]
): IngestResult {
  const errors: string[] = [];
  const kept: Record<string, unknown>[] = [];

  records.forEach((record, index) => {
    const missing = required.filter((key) => !hasValue(record, key));
    if (missing.length > 0) {
      errors.push(`Row ${index + 1} is missing: ${missing.join(", ")}`);
      return;
    }
    kept.push(record);
  });

  return { ok: kept.length > 0, records: kept, errors };
}

/**
 * Parse a paste of JSON or CSV, then validate it against the adapter's required keys.
 * Bad input comes back as errors, not as an exception.
 */
export function ingestPayload(text: string, required: string[] = []): IngestResult {
  const format = detectFormat(text);

  if (format === "empty") {
    return { ok: false, records: [], errors: ["Nothing pasted yet."] };
  }

  if (format === "json") {
    const parsed = parseJsonPayload(text);
    if (parsed === undefined) {
      return { ok: false, records: [], errors: ["That is not valid JSON. Check for a trailing comma."] };
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const records = list.filter(isRecord);
    const skipped = list.length - records.length;
    const result = validateRecords(records, required);
    if (skipped > 0) {
      result.errors.push(`${skipped} entr${skipped === 1 ? "y" : "ies"} were not objects and were skipped.`);
    }
    if (records.length === 0) {
      result.errors.push("No objects found. Desk expects an array of source records.");
    }
    return result;
  }

  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { ok: false, records: [], errors: ["CSV needs a header row and at least one data row."] };
  }
  return validateRecords(rows, required);
}
