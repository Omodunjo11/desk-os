"use client";

import Link from "next/link";
import { useDesk, TEMPLATE_MAP, TEMPLATES, ADAPTERS, rankCases, isClosedDisposition, isNeedMore } from "@/lib/desk";

const LOOP = [
  {
    n: "1",
    title: "Identify",
    body: "Read exceptions, alerts, obligations, or deviations straight from the systems that already hold them.",
  },
  {
    n: "2",
    title: "Prioritize",
    body: "Policy lanes first (a hold is not a ticket), then score inside the lane. Newest is not first.",
  },
  {
    n: "3",
    title: "Act",
    body: "Three plain actions. Need more is a packet of asks for the source system, not a stall.",
  },
  {
    n: "4",
    title: "Learn",
    body: "Labels group by typology for the weekly override review. Noise can retune a rule. Holds cannot.",
  },
];

export default function HomePage() {
  const { processes, ledger, customizations, casesByProcess } = useDesk();

  const cards = processes.map((process) => {
    const template = TEMPLATE_MAP[process.templateId];
    const cases = casesByProcess[process.id] ?? template.cases;
    const processLedger = ledger.filter((l) => l.processId === process.id);
    const ranked = rankCases(cases, template, customizations[process.id], processLedger);
    const closed = processLedger.filter((l) => isClosedDisposition(l.key));
    const parked = processLedger.filter((l) => l.key === "monitor");
    const done = closed.length;
    const openRows = ranked.filter(
      (r) => !r.collapsedInto && !closed.some((l) => l.caseId === r.item.id)
    );
    const open = openRows.length;
    const p1 = openRows.filter((r) => r.band === "P1").length;
    const holds = openRows.filter((r) => r.policy.hold).length;
    const needMore = openRows.filter((r) => isNeedMore(r.item) || parked.some((l) => l.caseId === r.item.id)).length;
    return { process, template, open, done, p1, holds, needMore };
  });

  const totals = cards.reduce(
    (acc, card) => ({
      open: acc.open + card.open,
      done: acc.done + card.done,
      p1: acc.p1 + card.p1,
      holds: acc.holds + card.holds,
      needMore: acc.needMore + card.needMore,
    }),
    { open: 0, done: 0, p1: 0, holds: 0, needMore: 0 }
  );

  return (
    <main className="page">
      <p className="kicker">Process OS</p>
      <h1>One ranked queue for every high-stakes workflow you run.</h1>
      <p className="lede">
        Desk sits between the systems that hold the truth and the person who has to act
        on it today. Plug in a workflow, map the fields once, and let each team decide
        how they want to work the backlog.
      </p>

      <div className="hero-grid">
        <div className="pipe">
          <ol>
            {LOOP.map((step) => (
              <li key={step.n}>
                <span className="n">{step.n}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="loop-back">↻ Then back to Identify. The next case restarts the cycle.</p>
        </div>
        <div className="card stat">
          <span className="op">Right now</span>
          <h3>{processes.length} processes running</h3>
          <p>
            {totals.holds} hold{totals.holds === 1 ? "" : "s"} sitting above score.{" "}
            {totals.needMore} Need more. {totals.p1} P1. {totals.open} open, {totals.done} closed.
          </p>
          <span className="meta">
            <span>{TEMPLATES.length} templates available</span>
            <span>{ADAPTERS.length} adapters wired</span>
          </span>
        </div>
      </div>

      <div className="section-head">
        <h2>Processes</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/learn" className="btn">
            Weekly review
          </Link>
          <Link href="/studio" className="btn primary">
            Add process
          </Link>
        </div>
      </div>

      <div className="grid-4">
        {cards.map(({ process, template, open, done, p1, holds, needMore }) => (
          <Link key={process.id} href={`/p/${process.id}`} className="card">
            <span className="op">{template.operator}</span>
            <h3>{process.name}</h3>
            <p>{template.promise}</p>
            <span className="meta">
              <span>{template.adapter.system}</span>
              <span>
                {holds > 0 ? `${holds} hold · ` : ""}
                {needMore > 0 ? `${needMore} Need more · ` : ""}
                {p1 > 0 ? `${p1} P1 · ` : ""}
                {open} open · {done} closed
              </span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
