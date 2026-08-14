"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import CustomizePanel from "@/components/CustomizePanel";
import { formatField, useProcess } from "@/lib/desk";

type BandFilter = "all" | "P1" | "P2" | "P3";
type StatusFilter = "open" | "done" | "all";

export default function QueueClient({ processId }: { processId: string }) {
  const { process, template, ranked, dispositionFor, visibleFields, labels } = useProcess(processId);
  const [band, setBand] = useState<BandFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [showCustom, setShowCustom] = useState(false);

  const rows = useMemo(() => {
    return ranked.filter((row) => {
      if (band !== "all" && row.band !== band) return false;
      const done = Boolean(dispositionFor(row.item.id));
      if (status === "open" && done) return false;
      if (status === "done" && !done) return false;
      return true;
    });
  }, [ranked, band, status, dispositionFor]);

  if (!process || !template) {
    return (
      <main className="page">
        <p className="empty">No process with that id.</p>
        <Link href="/" className="btn">
          Back to processes
        </Link>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="queue-head">
        <div>
          <p className="kicker">{template.operator}</p>
          <h1>{process.name}</h1>
          <p className="lede">{template.promise}</p>
          <p className="adapter">
            {template.adapter.system} · {template.rankingLabel}
          </p>
        </div>
        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          <div className="filter-seg" aria-label="Priority">
            {(["all", "P1", "P2", "P3"] as const).map((id) => (
              <button key={id} type="button" className={clsx(band === id && "on")} onClick={() => setBand(id)}>
                {id === "all" ? "All" : id}
              </button>
            ))}
          </div>
          <div className="filter-seg" aria-label="Status">
            {(["open", "done", "all"] as const).map((id) => (
              <button key={id} type="button" className={clsx(status === id && "on")} onClick={() => setStatus(id)}>
                {id === "open" ? "Open" : id === "done" ? "Done" : "All"}
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => setShowCustom((v) => !v)}>
            {showCustom ? "Hide customize" : "Customize"}
          </button>
        </div>
      </div>

      {showCustom && <CustomizePanel processId={processId} template={template} />}

      <div className="table" role="table" aria-label="Queue">
        <div className="row head" role="row">
          <span>Pri</span>
          <span>Case</span>
          <span>Why</span>
          {visibleFields.slice(0, 2).map((f) => (
            <span key={f.key}>{f.label}</span>
          ))}
          <span>Sev</span>
          <span>Status</span>
        </div>
        {rows.length === 0 && <p className="empty">Nothing in this slice of the queue.</p>}
        {rows.map(({ item, band: b, severity }) => {
          const disp = dispositionFor(item.id);
          return (
            <Link
              key={item.id}
              href={`/p/${processId}/${encodeURIComponent(item.id)}`}
              className={clsx("row", disp && "done")}
              role="row"
            >
              <span className={clsx("prio", b)}>{b}</span>
              <span className="title-cell">
                <b>{item.title}</b>
                <i>{item.subject}</i>
              </span>
              <span className="title-cell">
                <i>{item.whyFlagged}</i>
              </span>
              {visibleFields.slice(0, 2).map((f) => (
                <span key={f.key} className="num">
                  {item.values[f.key] !== undefined ? formatField(f.type, item.values[f.key]) : "—"}
                </span>
              ))}
              <span className={clsx("sev", severity)}>{severity}</span>
              <span className={clsx("disp-pill", disp?.key ?? "open")}>
                {disp ? labels(disp.key) : "Open"}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="foot">
        Priority is look-now. Severity is harm if true. They can diverge on purpose.
      </p>
    </main>
  );
}
