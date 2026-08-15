import type { LoggedDisposition } from "./types";
import type { RankedCase } from "./ranking";
import { isClosedDisposition } from "./policy";

export const DEFAULT_SHIFT_CAPACITY = 40;
export const MINUTES_PER_CASE = 12;

export type ShiftClock = {
  capacity: number;
  open: number;
  holds: number;
  p1: number;
  done: number;
  overflow: number;
  minutesNeeded: number;
  minutesAvailable: number;
  willFinish: boolean;
  mustHolds: RankedCase[];
};

export function shiftClock(
  ranked: RankedCase[],
  ledger: LoggedDisposition[],
  capacity = DEFAULT_SHIFT_CAPACITY
): ShiftClock {
  const cap = Math.max(1, Math.round(capacity));
  const doneIds = new Set(
    ledger.filter((row) => isClosedDisposition(row.key)).map((row) => row.caseId)
  );
  const visible = ranked.filter((row) => !row.collapsedInto);
  const openRows = visible.filter((row) => !doneIds.has(row.item.id));
  const holds = openRows.filter((row) => row.policy.hold);
  const p1 = openRows.filter((row) => row.band === "P1");
  const overflow = Math.max(0, openRows.length - cap);
  return {
    capacity: cap,
    open: openRows.length,
    holds: holds.length,
    p1: p1.length,
    done: visible.filter((row) => doneIds.has(row.item.id)).length,
    overflow,
    minutesNeeded: openRows.length * MINUTES_PER_CASE,
    minutesAvailable: cap * MINUTES_PER_CASE,
    willFinish: overflow === 0,
    mustHolds: holds,
  };
}
