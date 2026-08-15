import type { LoggedDisposition, ProcessInstance } from "./types";

/** Examiner-facing trail. Silent drops are not representable. */
export function formatAudit(
  ledger: LoggedDisposition[],
  processes: ProcessInstance[]
) {
  const names = Object.fromEntries(processes.map((p) => [p.id, p.name]));
  return JSON.stringify(
    {
      product: "Desk",
      exportedAt: new Date().toISOString(),
      entries: ledger.map((row) => ({
        at: row.at,
        process: names[row.processId] ?? row.processId,
        caseId: row.caseId,
        action: row.key,
        owner: row.owner ?? null,
        note: row.note || null,
        policy: row.policyLabel ?? null,
        writeback: row.writeback
          ? {
              destination: row.writeback.destination,
              sourceRecordId: row.writeback.sourceRecordId,
              field: row.writeback.field,
              value: row.writeback.value,
              overlayOnly: row.writeback.overlayOnly,
              learns: row.writeback.learns,
              status: row.writeback.status,
            }
          : null,
      })),
    },
    null,
    2
  );
}
