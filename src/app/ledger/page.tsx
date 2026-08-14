"use client";

import Link from "next/link";
import { formatAudit, TEMPLATE_MAP, useDesk } from "@/lib/desk";

export default function LedgerPage() {
  const { ledger, processes, reopen } = useDesk();

  const download = () => {
    const blob = new Blob([formatAudit(ledger, processes)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `desk-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="page">
      <div className="queue-head">
        <div>
          <p className="kicker">Learn</p>
          <h1>Outcome ledger</h1>
          <p className="lede">
            Every disposition across every process, with the label that would write back to the
            source system. Reopen a case if the call was wrong. Silent drops are not representable.
          </p>
        </div>
        <button type="button" className="btn" onClick={download} disabled={ledger.length === 0}>
          Export audit
        </button>
      </div>
      <div className="table">
        <div className="row ledger head">
          <span>When</span>
          <span>Process</span>
          <span>Case</span>
          <span>Action</span>
          <span>Write-back</span>
          <span></span>
        </div>
        {ledger.length === 0 && <p className="empty">No dispositions yet. Work a queue first.</p>}
        {ledger.map((row) => {
          const process = processes.find((p) => p.id === row.processId);
          const template = process ? TEMPLATE_MAP[process.templateId] : undefined;
          const label =
            template?.dispositions.find((d) => d.key === row.key)?.label ?? row.key;
          return (
            <div
              key={`${row.processId}-${row.caseId}-${row.at}`}
              className="row ledger"
              style={{ cursor: "default" }}
            >
              <span className="num">{new Date(row.at).toLocaleString()}</span>
              <span>
                {process?.name ?? row.processId}
                {row.policyLabel ? ` · ${row.policyLabel}` : ""}
              </span>
              <Link href={`/p/${row.processId}/${encodeURIComponent(row.caseId)}`}>{row.caseId}</Link>
              <span className={`disp-pill ${row.key}`}>{label}</span>
              <span className="title-cell">
                <b>
                  {row.writeback
                    ? `${row.writeback.field}=${row.writeback.value}`
                    : "No adapter mapping"}
                </b>
                <i>
                  {row.writeback
                    ? `${row.writeback.destination} · staged, overlay only`
                    : row.note || "—"}
                </i>
              </span>
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
