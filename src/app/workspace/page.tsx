"use client";

import { useState } from "react";
import { useDesk } from "@/lib/desk";

export default function WorkspacePage() {
  const { workspace, shareWorkspace, joinWorkspace, leaveWorkspace } = useDesk();
  const [name, setName] = useState("Shared desk");
  const [joinId, setJoinId] = useState("");
  const [joinKey, setJoinKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      await shareWorkspace(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Share failed");
    }
    setBusy(false);
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    const result = await joinWorkspace(joinId.trim(), joinKey.trim());
    if (!result.ok) setError(result.error ?? "Join failed");
    setBusy(false);
  };

  const shareUrl =
    typeof window !== "undefined" && workspace
      ? `${window.location.origin}/?ws=${workspace.id}&k=${workspace.key}`
      : "";

  return (
    <main className="page">
      <p className="kicker">Team</p>
      <h1>Workspace</h1>
      <p className="lede">
        A workspace key is the auth model. Anyone with the link sees the same queues, ledger, and
        customizations. This is a thin overlay store, not a fifth system of record. On a cold
        serverless instance the share is in-memory — pin it by keeping this deployment warm, or
        paste the key to rejoin.
      </p>

      {workspace ? (
        <div className="customize">
          <h2>{workspace.name}</h2>
          <p className="foot">
            Id <code className="mono">{workspace.id}</code> · key{" "}
            <code className="mono">{workspace.key}</code>
          </p>
          <p className="foot">Share URL</p>
          <input readOnly value={shareUrl} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => void navigator.clipboard.writeText(shareUrl)}
            >
              Copy link
            </button>
            <button type="button" className="btn" onClick={leaveWorkspace}>
              Work locally
            </button>
          </div>
        </div>
      ) : (
        <div className="customize">
          <h2>Share this desk</h2>
          <label className="field">
            <span>Workspace name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void share()}>
            Create share link
          </button>
        </div>
      )}

      <div className="customize">
        <h2>Join with a key</h2>
        <div className="studio-grid">
          <label className="field">
            <span>Workspace id</span>
            <input value={joinId} onChange={(e) => setJoinId(e.target.value)} />
          </label>
          <label className="field">
            <span>Key</span>
            <input value={joinKey} onChange={(e) => setJoinKey(e.target.value)} />
          </label>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={() => void join()}>
          Join
        </button>
        {error && <p className="divergence">{error}</p>}
      </div>
    </main>
  );
}
