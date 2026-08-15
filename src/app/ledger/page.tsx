"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatAudit, TEMPLATE_MAP, useDesk } from "@/lib/desk";

export default function LedgerPage() {
  const { ledger, processes, reopen } = useDesk();
  const [inbox, setInbox] = useState<{ at: string; payload: { field: string; value: string; sourceRecordId: string } }[]>(
    []
  );

  useEffect(() => {
    void fetch("/api/writeback")
      .then((r) => r.json())
      .then((data) => setInbox(data.labels ?? []))
      .catch(() => undefined);
  }, [ledger]);

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
          <p className="kicker">Record</p>
          <h1>Outcome ledger</h1>
          <p className="lede">
            Every disposition across every process, with the label that would write back to the
            source system. Reopen a case if the call was wrong. Silent drops are not representable.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/learn" className="btn">
            Weekly review
          </Link>
          <button type="button" className="btn" onClick={download} disabled={ledger.length === 0}>
            Export audit
          </button>
        </div>
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
                    ? `${row.writeback.destination} · ${row.writeback.status}, overlay only${
                        row.writeback.asks?.length ? ` · ${row.writeback.asks.length} asks` : ""
                      }`
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

      <h2 style={{ marginTop: 28 }}>Source-system sink</h2>
      <p className="lede">
        Labels this deployment actually received on POST /api/writeback. Proof the overlay posted.
      </p>
      <div className="table">
        <div className="row ledger head">
          <span>When</span>
          <span>Record</span>
          <span>Field</span>
          <span>Value</span>
          <span></span>
          <span></span>
        </div>
        {inbox.length === 0 && <p className="empty">No posted labels yet. Disposition a case with write-back on.</p>}
        {inbox.map((row) => (
          <div key={row.at + row.payload.sourceRecordId} className="row ledger" style={{ cursor: "default" }}>
            <span className="num">{new Date(row.at).toLocaleString()}</span>
            <span>{row.payload.sourceRecordId}</span>
            <span className="mono">{row.payload.field}</span>
            <span>{row.payload.value}</span>
            <span />
            <span />
          </div>
        ))}
      </div>
    </main>
  );
}
