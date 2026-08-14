"use client";

import Link from "next/link";
import { TEMPLATE_MAP, useDesk } from "@/lib/desk";

export default function LedgerPage() {
  const { ledger, processes, reopen } = useDesk();

  return (
    <main className="page">
      <p className="kicker">Learn</p>
      <h1>Outcome ledger</h1>
      <p className="lede">
        Every disposition across every process. Reopen a case if the call was wrong.
      </p>
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
              <span className={`disp-pill ${row.key}`}>{label}</span>
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
