"use client";

import Link from "next/link";
import { analyzeLearning, emptyCustom, TEMPLATE_MAP, useDesk } from "@/lib/desk";
import type { ProcessInstance, ProcessTemplate, WeightSuggestion } from "@/lib/desk";

export default function LedgerPage() {
  const { ledger, processes, casesByProcess, customizations, customize, reopen } = useDesk();

  return (
    <main className="page">
      <p className="kicker">Learn</p>
      <h1>Outcome ledger</h1>
      <p className="lede">
        Every disposition across every process. Reopen a case if the call was wrong.
      </p>

      {processes.map((process) => {
        const template = TEMPLATE_MAP[process.templateId];
        const processLedger = ledger.filter((l) => l.processId === process.id);
        if (processLedger.length < 3) return null;
        return (
          <ProcessPatterns
            key={process.id}
            process={process}
            template={template}
            ledger={processLedger}
            cases={casesByProcess[process.id] ?? []}
            weights={customizations[process.id]?.weights}
            onApply={(key, next) =>
              customize(process.id, {
                weights: { ...(customizations[process.id]?.weights ?? {}), [key]: next },
              })
            }
          />
        );
      })}

      <div className="table">
        <div className="row head">
          <span>When</span>
          <span>Process</span>
          <span>Case</span>
          <span>Action</span>
          <span>Note</span>
          <span></span>
        </div>
        {ledger.length === 0 && <p className="empty">No dispositions yet. Work a queue first.</p>}
        {ledger.map((row) => {
          const process = processes.find((p) => p.id === row.processId);
          const template = process ? TEMPLATE_MAP[process.templateId] : undefined;
          const label =
            template?.dispositions.find((d) => d.key === row.key)?.label ?? row.key;
          return (
            <div key={`${row.processId}-${row.caseId}-${row.at}`} className="row" style={{ cursor: "default" }}>
              <span className="num">{new Date(row.at).toLocaleString()}</span>
              <span>{process?.name ?? row.processId}</span>
              <Link href={`/p/${row.processId}/${encodeURIComponent(row.caseId)}`}>{row.caseId}</Link>
              <span className={`disp-pill ${row.key}`}>
                {label}
                {row.source === "agent" && <span className="agent-tag">Agent</span>}
              </span>
              <span>{row.note || "—"}</span>
              <button type="button" className="btn" onClick={() => reopen(row.caseId)}>
                Reopen
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function ProcessPatterns({
  process,
  template,
  ledger,
  cases,
  weights,
  onApply,
}: {
  process: ProcessInstance;
  template: ProcessTemplate;
  ledger: Parameters<typeof analyzeLearning>[0];
  cases: Parameters<typeof analyzeLearning>[1];
  weights?: Record<string, number>;
  onApply: (key: string, next: number) => void;
}) {
  const custom = weights ? { ...emptyCustom(template), weights } : undefined;
  const summary = analyzeLearning(ledger, cases, template, custom);
  if (summary.suggestions.length === 0 && summary.overrideRate === 0) return null;

  const currentWeight = (key: string) =>
    weights?.[key] ?? template.rankingInputs.find((i) => i.key === key)?.weight ?? 0;

  const apply = (s: WeightSuggestion) => {
    const current = currentWeight(s.key);
    const next = Math.max(0, Math.min(1, current + (s.direction === "raise" ? 0.08 : -0.08)));
    onApply(s.key, next);
  };

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <h2>{process.name} — patterns</h2>
      <p className="muted">
        {summary.overrides} of {summary.total} dispositions ({Math.round(summary.overrideRate * 100)}%)
        went against what the queue suggested.
      </p>
      {summary.suggestions.length === 0 && (
        <p className="foot">Not enough repeat divergence yet to suggest a weight change.</p>
      )}
      {summary.suggestions.map((s) => (
        <div key={s.key} className="rec" style={{ marginTop: 8 }}>
          <b>{s.direction === "raise" ? "Raise" : "Lower"} {s.label}.</b> {s.reason}
          <div className="actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => apply(s)}>
              {s.direction === "raise" ? "Raise" : "Lower"} {s.label} weight
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
