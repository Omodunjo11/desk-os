"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { formatScore, useProcess } from "@/lib/desk";
import type { DispositionKey } from "@/lib/desk";

export default function CaseClient({
  processId,
  caseId,
}: {
  processId: string;
  caseId: string;
}) {
  const router = useRouter();
  const {
    process,
    template,
    ranked,
    cases,
    dispositionFor,
    labels,
    store,
  } = useProcess(processId);
  const item = cases.find((c) => c.id === caseId) ?? ranked.find((r) => r.item.id === caseId)?.item;
  const rankedRow = ranked.find((r) => r.item.id === caseId);
  const [note, setNote] = useState("");
  const [noteRequired, setNoteRequired] = useState(false);

  if (!process || !template || !item) {
    return (
      <main className="page">
        <p className="empty">Case not found.</p>
        <Link href={`/p/${processId}`} className="btn">
          Back to queue
        </Link>
      </main>
    );
  }

  const current = dispositionFor(item.id);
  const diverge =
    rankedRow &&
    ((rankedRow.band === "P1" && rankedRow.severity === "low") ||
      (rankedRow.band === "P3" && (rankedRow.severity === "critical" || rankedRow.severity === "high")));

  const act = (key: DispositionKey) => {
    const isHighRiskDismiss = key === "dismiss" && rankedRow?.band === "P1";
    if (isHighRiskDismiss && note.trim().length === 0) {
      setNoteRequired(true);
      return;
    }
    setNoteRequired(false);
    store.dispose(processId, item.id, key, note);
    router.push(`/p/${processId}`);
  };

  return (
    <div className="page">
      <div className="case-layout">
        <aside className="rail">
          <p className="rail-label">{process.name}</p>
          {ranked.map((row) => (
            <Link
              key={row.item.id}
              href={`/p/${processId}/${encodeURIComponent(row.item.id)}`}
              className={clsx("rail-item", row.item.id === item.id && "on")}
            >
              <span className={clsx("prio", row.band)}>{row.band}</span>
              <span>
                <b>{row.item.title}</b>
                <i>{row.item.subject}</i>
              </span>
            </Link>
          ))}
        </aside>

        <div className="case-main">
          <div className="hero">
            <p className="kicker">{template.operator}</p>
            <h1>{item.title}</h1>
            <p className="lede">{item.subject}</p>
            <div className="kpis">
              <div>
                <span>Priority</span>
                <b>{rankedRow?.band ?? "—"}</b>
              </div>
              <div>
                <span>Severity</span>
                <b>{rankedRow?.severity ?? "—"}</b>
              </div>
              <div>
                <span>Coverage</span>
                <b>{item.intakeCoverage !== undefined ? formatScore(item.intakeCoverage) : "seed"}</b>
              </div>
              <div>
                <span>Suggested</span>
                <b>{item.recommendedDisposition ? labels(item.recommendedDisposition) : "—"}</b>
              </div>
            </div>
            {diverge && (
              <p className="divergence">
                Priority and severity diverge. Look-now is not the same as harm-if-true.
              </p>
            )}
          </div>

          <div className="grid-2">
            <div className="panel">
              <h2>Why this is here</h2>
              <p className="muted">{item.whyFlagged}</p>
              <ul className="evidence">
                {item.evidence.map((e) => (
                  <li key={e.label + e.detail}>
                    <strong>{e.label}</strong>
                    <span>{e.detail}</span>
                  </li>
                ))}
              </ul>
              {item.gaps && item.gaps.length > 0 && (
                <div className="warn">
                  Missing for a full decision: {item.gaps.join(", ")}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="rec">
                <b>Recommended.</b> {item.recommendedAction}
              </div>
              <div className="warn">{item.uncertainty}</div>
              <p className="foot">Current: {current ? labels(current.key) : "Open"}</p>
              <textarea
                className="note"
                placeholder={
                  rankedRow?.band === "P1"
                    ? "Note for the ledger (required to dismiss a P1)"
                    : "Optional note for the ledger"
                }
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  if (noteRequired) setNoteRequired(false);
                }}
              />
              {noteRequired && (
                <p className="divergence">
                  Dismissing a P1 case is the highest-risk override in this queue. Write
                  a note explaining why before it clears.
                </p>
              )}
              <div className="actions">
                {template.dispositions.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className={clsx("btn", d.key === "act" && "green", d.key === "dismiss" && "danger")}
                    onClick={() => act(d.key)}
                  >
                    {labels(d.key)}
                    <small>{d.description}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
