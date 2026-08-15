"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { formatOverridePack, overrideReview, useDesk } from "@/lib/desk";

const ADVICE: Record<string, string> = {
  retune: "Retune",
  "do-not-touch": "Do not touch",
  "need-more": "Need more",
  "keep-working": "Keep labeling",
};

export default function LearnPage() {
  const { ledger, processes, casesByProcess, applySampleWeek } = useDesk();
  const [msg, setMsg] = useState<string | null>(null);
  const buckets = useMemo(
    () => overrideReview(ledger, casesByProcess, processes),
    [ledger, casesByProcess, processes]
  );

  const retune = buckets.filter((b) => b.recommendation === "retune").length;
  const frozen = buckets.filter((b) => b.recommendation === "do-not-touch").length;

  const download = () => {
    const blob = new Blob([formatOverridePack(buckets)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `desk-override-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sample = () => {
    const result = applySampleWeek();
    setMsg(
      result.ok
        ? `Sample week applied (${result.count} labels). Mule noise is a retune candidate. Elder stays do-not-touch.`
        : result.error ?? "Could not apply sample week."
    );
  };

  return (
    <main className="page">
      <div className="queue-head">
        <div>
          <p className="kicker">Learn</p>
          <h1>Weekly override review</h1>
          <p className="lede">
            Group this week&apos;s labels by typology. False positives become a pack the TM system
            can retune. Holds and elder cases cannot be tuned off. Desk does not auto-clear anything.
          </p>
          <div className="stat-row">
            <span>
              <b>{buckets.length}</b> patterns
            </span>
            <span>
              <b>{retune}</b> retune candidates
            </span>
            <span>
              <b>{frozen}</b> do-not-touch
            </span>
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          <button type="button" className="btn" onClick={sample}>
            Apply sample week
          </button>
          <button type="button" className="btn primary" onClick={download} disabled={buckets.length === 0}>
            Export override pack
          </button>
          <Link href="/ledger" className="btn">
            Open ledger
          </Link>
        </div>
      </div>

      {msg && <p className="divergence">{msg}</p>}

      <div className="table">
        <div className="row learn head">
          <span>Advice</span>
          <span>Pattern</span>
          <span>n</span>
          <span>Clear</span>
          <span>Need more</span>
          <span>Escalate</span>
          <span>Why</span>
        </div>
        {buckets.length === 0 && (
          <p className="empty">
            No labels yet. Work a queue, or apply a sample week to see mule noise vs elder holds.
          </p>
        )}
        {buckets.map((row) => (
          <div key={row.key} className="row learn" style={{ cursor: "default" }}>
            <span className={clsx("advice", row.recommendation)}>{ADVICE[row.recommendation]}</span>
            <span className="title-cell">
              <b>{row.label}</b>
              <i>{row.templateId}</i>
            </span>
            <span className="num">{row.n}</span>
            <span className="num">{row.dismissed}</span>
            <span className="num">{row.monitored}</span>
            <span className="num">{row.acted}</span>
            <span className="title-cell">
              <i>{row.reason}</i>
            </span>
          </div>
        ))}
      </div>
      <p className="foot">
        Kinage rule: precision goes up by labeling noise, not by hiding holds. A silent drop fails
        the exam.
      </p>
    </main>
  );
}
