"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { formatScore, noteRequiredFor, stageWriteback, useProcess } from "@/lib/desk";
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
  const [blockReason, setBlockReason] = useState<string | null>(null);

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
  const policy = rankedRow?.policy;
  const preview = stageWriteback(item, "monitor", note);
  const diverge =
    rankedRow &&
    ((rankedRow.band === "P1" && rankedRow.severity === "low") ||
      (rankedRow.band === "P3" && (rankedRow.severity === "critical" || rankedRow.severity === "high")));

  const act = (key: DispositionKey) => {
    const result = store.dispose(processId, item.id, key, note);
    if (!result.ok) {
      setBlockReason(result.reason);
      return;
    }
    setBlockReason(null);
    router.push(`/p/${processId}`);
  };

  const needsNote = policy
    ? noteRequiredFor("dismiss", policy, rankedRow?.band ?? "P3")
    : rankedRow?.band === "P1";

  return (
    <div className="page">
      <div className="case-layout">
        <aside className="rail">
          <p className="rail-label">{process.name}</p>
          {ranked
            .filter((row) => !row.collapsedInto)
            .map((row) => (
              <Link
                key={row.item.id}
                href={`/p/${processId}/${encodeURIComponent(row.item.id)}`}
                className={clsx("rail-item", row.item.id === item.id && "on")}
              >
                <span className={clsx("prio", row.band)}>{row.band}</span>
                <span>
                  <b>{row.item.title}</b>
                  <i>
                    {row.policy.hold ? "Hold · " : ""}
                    {row.item.subject}
                  </i>
                </span>
              </Link>
            ))}
        </aside>

        <div className="case-main">
          <div className="hero">
            <p className="kicker">{template.operator}</p>
            <h1>{item.title}</h1>
            <p className="lede">{item.subject}</p>
            {policy && (
              <p className={clsx("lane", policy.hold && "hold")} style={{ marginTop: 10 }}>
                {policy.hold ? "Hold" : "Lane"} · {policy.label}
                {policy.neverAutoDismiss ? " · cannot auto-clear" : ""}
              </p>
            )}
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
            {policy?.hold && (
              <p className="divergence">
                This is a hold, not a ticket. A human has to look. Desk will not auto-release it.
              </p>
            )}
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
              {rankedRow && rankedRow.similar.dismissed > 0 && (
                <p className="foot">
                  {rankedRow.similar.dismissed} similar cases were labeled noise. This row is
                  down-weighted, not auto-cleared.
                </p>
              )}
            </div>

            <div className="panel">
              <div className="rec">
                <b>Recommended.</b> {item.recommendedAction}
              </div>
              <div className="warn">{item.uncertainty}</div>
              <p className="foot">Current: {current ? labels(current.key) : "Open"}</p>
              {preview && (
                <p className="writeback">
                  Overlay only. Would label {preview.destination}{" "}
                  <code>
                    {preview.field}={preview.value}
                  </code>{" "}
                  on {preview.sourceRecordId}. Desk is not the system of record.
                </p>
              )}
              <textarea
                className="note"
                placeholder={
                  needsNote
                    ? "Note for the ledger (required to dismiss a hold or P1)"
                    : "Optional note for the ledger"
                }
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  if (blockReason) setBlockReason(null);
                }}
              />
              {blockReason && <p className="divergence">{blockReason}</p>}
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
