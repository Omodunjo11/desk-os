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
    body: "Rank by what the process actually weighs, so the queue opens with the right case on top, not the newest one.",
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
  const { processes, ledger, customizations } = useDesk();

  let totalOpen = 0;
  let totalDone = 0;
  let totalP1 = 0;

  const cards = processes.map((process) => {
    const template = TEMPLATE_MAP[process.templateId];
    const ranked = rankCases(template.cases, template, customizations[process.id]);
    const done = ledger.filter((l) => l.processId === process.id).length;
    const open = ranked.length - done;
    const p1 = ranked.filter(
      (r) => r.band === "P1" && !ledger.some((l) => l.processId === process.id && l.caseId === r.item.id)
    ).length;
    totalOpen += open;
    totalDone += done;
    totalP1 += p1;
    return { process, template, open, done, p1 };
  });

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
            {totalP1} case{totalP1 === 1 ? "" : "s"} sitting at P1 across every queue.{" "}
            {totalOpen} open in total, {totalDone} dispositioned so far.
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
        {cards.map(({ process, template, open, done, p1 }) => (
          <Link key={process.id} href={`/p/${process.id}`} className="card">
            <span className="op">{template.operator}</span>
            <h3>{process.name}</h3>
            <p>{template.promise}</p>
            <span className="meta">
              <span>{template.adapter.system}</span>
              <span>
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
