"use client";

import Link from "next/link";
import clsx from "clsx";
import {
  useDesk,
  TEMPLATE_MAP,
  rankCases,
  isClosedDisposition,
  isNeedMore,
  packetAsks,
} from "@/lib/desk";
import type { RankedCase } from "@/lib/desk";

type BoardRow = {
  processId: string;
  processName: string;
  row: RankedCase;
};

function hrefFor(processId: string, caseId: string) {
  return `/p/${processId}/${encodeURIComponent(caseId)}`;
}

export default function HomePage() {
  const { processes, ledger, customizations, casesByProcess } = useDesk();

  const desks = processes.map((process) => {
    const template = TEMPLATE_MAP[process.templateId];
    const cases = casesByProcess[process.id] ?? template.cases;
    const processLedger = ledger.filter((l) => l.processId === process.id);
    const ranked = rankCases(cases, template, customizations[process.id], processLedger);
    const closed = new Set(processLedger.filter((l) => isClosedDisposition(l.key)).map((l) => l.caseId));
    const parked = processLedger.filter((l) => l.key === "monitor");
    const openRows = ranked.filter((r) => !r.collapsedInto && !closed.has(r.item.id));
    const holds = openRows.filter((r) => r.policy.hold);
    const needMore = openRows.filter(
      (r) => isNeedMore(r.item) || parked.some((l) => l.caseId === r.item.id)
    );
    const p1 = openRows.filter((r) => r.band === "P1");
    return {
      process,
      template,
      open: openRows.length,
      p1: p1.length,
      holds: holds.length,
      needMore: needMore.length,
      top: openRows[0],
      holdRows: holds,
      needRows: needMore,
    };
  });

  const must: BoardRow[] = desks
    .flatMap((d) =>
      d.holdRows.map((row) => ({
        processId: d.process.id,
        processName: d.process.name,
        row,
      }))
    )
    .sort((a, b) => a.row.policy.floor - b.row.policy.floor || b.row.score - a.row.score);

  const now = must[0];
  const restMust = must.slice(1);
  const nowAsk = now ? packetAsks(now.row.item)[0] : undefined;

  const thin: BoardRow[] = desks
    .flatMap((d) =>
      d.needRows
        .filter((row) => !row.policy.hold)
        .map((row) => ({
          processId: d.process.id,
          processName: d.process.name,
          row,
        }))
    )
    .sort((a, b) => b.row.score - a.row.score)
    .slice(0, 5);

  const totals = desks.reduce(
    (acc, d) => ({
      open: acc.open + d.open,
      p1: acc.p1 + d.p1,
      holds: acc.holds + d.holds,
      needMore: acc.needMore + d.needMore,
    }),
    { open: 0, p1: 0, holds: 0, needMore: 0 }
  );

  return (
    <main className="page board">
      <p className="kicker">This shift</p>
      <div className="board-kpis" aria-label="Shift totals">
        <div>
          <span>Holds</span>
          <b>{totals.holds}</b>
        </div>
        <div>
          <span>Need more</span>
          <b>{totals.needMore}</b>
        </div>
        <div>
          <span>P1</span>
          <b>{totals.p1}</b>
        </div>
        <div>
          <span>Open</span>
          <b>{totals.open}</b>
        </div>
      </div>

      {now ? (
        <Link href={hrefFor(now.processId, now.row.item.id)} className="now hold">
          <div className="now-meta">
            <span className="run-n">01</span>
            <span className="lane hold">Hold</span>
            <span>{now.processName}</span>
            <span className={clsx("prio", now.row.band)}>{now.row.band}</span>
            {now.row.policy.neverAutoDismiss && <span>Cannot auto-clear</span>}
          </div>
          <h1>{now.row.item.title}</h1>
          <p className="now-why">{now.row.item.whyFlagged}</p>
          <p className="now-ask">Ask · {nowAsk?.ask ?? now.row.item.recommendedAction}</p>
          <span className="now-go">Open packet</span>
        </Link>
      ) : (
        <div className="now clear">
          <div className="now-meta">
            <span className="lane">Clear</span>
          </div>
          <h1>No holds on the board.</h1>
          <p className="now-why">Work Need more, then P1. A hold still sits above score when it lands.</p>
        </div>
      )}

      {restMust.length > 0 && (
        <section className="board-section">
          <h2>Then</h2>
          <ol className="run-sheet">
            {restMust.map((item, i) => (
              <li key={`${item.processId}:${item.row.item.id}`}>
                <span className="run-n">{String(i + 2).padStart(2, "0")}</span>
                <Link href={hrefFor(item.processId, item.row.item.id)}>
                  <b>{item.row.item.title}</b>
                  <i>
                    {item.processName} · {item.row.policy.label} · {item.row.band}
                  </i>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {thin.length > 0 && (
        <section className="board-section">
          <h2>Need more</h2>
          <ol className="run-sheet thin">
            {thin.map((item, i) => {
              const ask = packetAsks(item.row.item)[0];
              return (
                <li key={`${item.processId}:${item.row.item.id}`}>
                  <span className="run-n">{String(i + 1).padStart(2, "0")}</span>
                  <Link href={hrefFor(item.processId, item.row.item.id)}>
                    <b>{item.row.item.title}</b>
                    <i>
                      {item.processName} · {ask?.ask ?? "Packet incomplete"}
                    </i>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="board-section">
        <div className="section-head">
          <h2>Desks</h2>
          <Link href="/studio" className="btn">
            Add
          </Link>
        </div>
        <div className="blotter">
          {desks.map(({ process, template, open, p1, holds, needMore, top }) => (
            <Link
              key={process.id}
              href={`/p/${process.id}`}
              className={clsx("blotter-cell", holds > 0 && "has-hold")}
            >
              <span className="op">{process.name}</span>
              <span className="blotter-counts">
                <b>{holds}</b>
                <em>hold</em>
                <b>{needMore}</b>
                <em>need</em>
                <b>{p1}</b>
                <em>p1</em>
                <b>{open}</b>
                <em>open</em>
              </span>
              <i>
                {top
                  ? `${top.policy.hold ? "Hold" : top.band} · ${top.item.title}`
                  : "Clear"}
              </i>
              <span className="foot">{template.adapter.system}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
