"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import CustomizePanel from "@/components/CustomizePanel";
import { formatField, isClosedDisposition, isNeedMore, packetAsks, shiftClock, useProcess } from "@/lib/desk";

type BandFilter = "all" | "P1" | "P2" | "P3";
type StatusFilter = "open" | "need-more" | "done" | "all";

export default function QueueClient({ processId }: { processId: string }) {
  const { process, template, ranked, dispositionFor, visibleFields, labels, custom, dispositions } =
    useProcess(processId);
  const [band, setBand] = useState<BandFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [showCustom, setShowCustom] = useState(false);
  const [showCollapsed, setShowCollapsed] = useState(false);

  const collapsedHidden = ranked.filter((row) => row.collapsedInto).length;

  const clock = shiftClock(ranked, dispositions, custom?.shiftCapacity ?? 40);

  const rows = useMemo(() => {
    return ranked.filter((row) => {
      if (!showCollapsed && row.collapsedInto) return false;
      if (band !== "all" && row.band !== band) return false;
      const entry = dispositionFor(row.item.id);
      const done = Boolean(entry && isClosedDisposition(entry.key));
      const parked = entry?.key === "monitor";
      const needMore = !done && (isNeedMore(row.item) || parked);
      if (status === "open" && done) return false;
      if (status === "need-more" && !needMore) return false;
      if (status === "done" && !done) return false;
      return true;
    });
  }, [ranked, band, status, dispositionFor, showCollapsed]);

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

  const nowRow = status === "done" ? undefined : (rows.find((r) => r.policy.hold) ?? rows[0]);
  const nowAsk = nowRow ? packetAsks(nowRow.item)[0] : undefined;
  const restRows = rows.filter((row) => row.item.id !== nowRow?.item.id);

  return (
    <main className="page">
      <div className="queue-head">
        <div>
          <p className="kicker">{template.operator}</p>
          <h1>{process.name}</h1>
          <p className="adapter">
            {template.adapter.system} · {template.rankingLabel}
          </p>
          <div className="stat-row">
            <span>
              <b>{clock.open}</b> open · capacity {clock.capacity}
            </span>
            <span>
              <b>{clock.p1}</b> P1
            </span>
            <span>
              <b>{clock.holds}</b> hold{clock.holds === 1 ? "" : "s"} ahead of score
            </span>
            <span>
              <b>
                {
                  ranked.filter((row) => {
                    if (row.collapsedInto) return false;
                    const entry = dispositionFor(row.item.id);
                    const done = Boolean(entry && isClosedDisposition(entry.key));
                    return !done && (isNeedMore(row.item) || entry?.key === "monitor");
                  }).length
                }
              </b>{" "}
              Need more
            </span>
            <span>
              <b>{clock.minutesNeeded}m</b> to work · {clock.minutesAvailable}m in the shift
            </span>
          </div>
          {!clock.willFinish && (
            <p className="divergence">
              You will not finish this queue today ({clock.overflow} over capacity). Holds still
              must: {clock.mustHolds.map((row) => row.item.title).join(" · ") || "none"}.
            </p>
          )}
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
            {(["open", "need-more", "done", "all"] as const).map((id) => (
              <button key={id} type="button" className={clsx(status === id && "on")} onClick={() => setStatus(id)}>
                {id === "open" ? "Open" : id === "need-more" ? "Need more" : id === "done" ? "Done" : "All"}
              </button>
            ))}
          </div>
          {collapsedHidden > 0 && (
            <button type="button" className="btn" onClick={() => setShowCollapsed((v) => !v)}>
              {showCollapsed ? "Hide sibling alarms" : `Show ${collapsedHidden} sibling alarms`}
            </button>
          )}
          <button type="button" className="btn" onClick={() => setShowCustom((v) => !v)}>
            {showCustom ? "Hide customize" : "Customize"}
          </button>
        </div>
      </div>

      {showCustom && <CustomizePanel processId={processId} template={template} />}

      {nowRow && (
        <Link
          href={`/p/${processId}/${encodeURIComponent(nowRow.item.id)}`}
          className={clsx("now", nowRow.policy.hold && "hold")}
        >
          <div className="now-meta">
            <span className="run-n">01</span>
            {nowRow.policy.hold ? (
              <span className="lane hold">Hold</span>
            ) : (
              <span className="lane need-more">Now</span>
            )}
            <span className={clsx("prio", nowRow.band)}>{nowRow.band}</span>
            {nowRow.policy.neverAutoDismiss && <span>Cannot auto-clear</span>}
          </div>
          <h1>{nowRow.item.title}</h1>
          <p className="now-why">{nowRow.item.whyFlagged}</p>
          {nowAsk && <p className="now-ask">Ask · {nowAsk.ask}</p>}
          <span className="now-go">Open packet</span>
        </Link>
      )}

      {(restRows.length > 0 || !nowRow) && (
      <div className="table" role="table" aria-label="Queue">
        <div className="row queue head" role="row">
          <span>Pri</span>
          <span>Lane</span>
          <span>Case</span>
          <span>Why</span>
          {visibleFields.slice(0, 2).map((f) => (
            <span key={f.key}>{f.label}</span>
          ))}
          <span>Sev</span>
          <span>Status</span>
        </div>
        {restRows.length === 0 && <p className="empty">Nothing in this slice of the queue.</p>}
        {restRows.map((row) => {
          const { item, band: b, severity, policy, similar, floodCount } = row;
          const disp = dispositionFor(item.id);
          const parked = disp?.key === "monitor";
          const closed = Boolean(disp && isClosedDisposition(disp.key));
          const needMore = !closed && (isNeedMore(item) || parked);
          const asks = needMore ? packetAsks(item) : [];
          return (
            <Link
              key={item.id}
              href={`/p/${processId}/${encodeURIComponent(item.id)}`}
              className={clsx("row", "queue", closed && "done", policy.hold && "hold")}
              role="row"
            >
              <span className={clsx("prio", b)}>{b}</span>
              <span className={clsx("lane", policy.hold && "hold", needMore && !policy.hold && "need-more")}>
                {policy.hold ? "Hold" : needMore ? "Need more" : policy.label}
              </span>
              <span className="title-cell">
                <b>{item.title}</b>
                <i>{item.subject}</i>
                {parked && (
                  <i>
                    Parked with {disp?.owner ?? "no owner"} · still in the queue
                  </i>
                )}
                {floodCount > 1 && !row.collapsedInto && (
                  <i>
                    {floodCount} tags on this asset collapsed — ISA-18.2 flood, not {floodCount}{" "}
                    cases.
                  </i>
                )}
                {asks.length > 0 && (
                  <i>
                    Ask: {asks[0].ask}
                    {asks.length > 1 ? ` · +${asks.length - 1}` : ""}
                  </i>
                )}
                {similar.dismissed > 0 && (
                  <i>
                    {similar.dismissed} similar labeled noise. Still in the queue; not auto-cleared.
                  </i>
                )}
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
              <span className={clsx("disp-pill", disp?.key ?? (needMore ? "need-more" : "open"))}>
                {closed
                  ? labels(disp!.key)
                  : parked
                    ? `${labels("monitor")}${disp?.owner ? ` · ${disp.owner}` : ""}`
                    : needMore
                      ? "Need more"
                      : "Open"}
              </span>
            </Link>
          );
        })}
      </div>
      )}
      <p className="foot">
        Policy lanes sit above score. A hold cannot fall behind ACH noise. Park with owner stays in the queue.
      </p>
    </main>
  );
}
