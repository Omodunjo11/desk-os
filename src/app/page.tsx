"use client";

import Link from "next/link";
import { useDesk, TEMPLATE_MAP, TEMPLATES, ADAPTERS, rankCases } from "@/lib/desk";

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
    body: "Three plain actions per case, named however the team names them. Every action leaves a record.",
  },
  {
    n: "4",
    title: "Learn",
    body: "Dispositions land in the ledger. Reopen anything, watch the pattern, retune the weights.",
  },
];

export default function HomePage() {
  const { processes, ledger, customizations, casesByProcess } = useDesk();

  const cards = processes.map((process) => {
    const template = TEMPLATE_MAP[process.templateId];
    const cases = casesByProcess[process.id] ?? template.cases;
    const processLedger = ledger.filter((l) => l.processId === process.id);
    const ranked = rankCases(cases, template, customizations[process.id], processLedger);
    const done = processLedger.length;
    const openRows = ranked.filter(
      (r) => !r.collapsedInto && !processLedger.some((l) => l.caseId === r.item.id)
    );
    const open = openRows.length;
    const p1 = openRows.filter((r) => r.band === "P1").length;
    const holds = openRows.filter((r) => r.policy.hold).length;
    return { process, template, open, done, p1, holds };
  });

  const totals = cards.reduce(
    (acc, card) => ({
      open: acc.open + card.open,
      done: acc.done + card.done,
      p1: acc.p1 + card.p1,
      holds: acc.holds + card.holds,
    }),
    { open: 0, done: 0, p1: 0, holds: 0 }
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
        </div>
        <div className="card" style={{ cursor: "default" }}>
          <span className="op">Right now</span>
          <h3>{processes.length} processes running</h3>
          <p>
            {totals.holds} hold{totals.holds === 1 ? "" : "s"} sitting above score.{" "}
            {totals.p1} P1 across every queue. {totals.open} open, {totals.done} dispositioned.
          </p>
          <span className="meta">
            <span>{TEMPLATES.length} templates available</span>
            <span>{ADAPTERS.length} adapters wired</span>
          </span>
        </div>
      </div>

      <div className="section-head">
        <h2>Processes</h2>
        <Link href="/studio" className="btn primary">
          Add process
        </Link>
      </div>

      <div className="grid-4">
        {cards.map(({ process, template, open, done, p1, holds }) => (
          <Link key={process.id} href={`/p/${process.id}`} className="card">
            <span className="op">{template.operator}</span>
            <h3>{process.name}</h3>
            <p>{template.promise}</p>
            <span className="meta">
              <span>{template.adapter.system}</span>
              <span>
                {holds > 0 ? `${holds} hold · ` : ""}
                {p1 > 0 ? `${p1} P1 · ` : ""}
                {open} open · {done} done
              </span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
