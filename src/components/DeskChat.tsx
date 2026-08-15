"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { answerChat, useDesk } from "@/lib/desk";
import type { ChatReply } from "@/lib/desk";

const STARTERS = [
  "What should I work?",
  "Why this?",
  "What's missing?",
  "Who owns this?",
  "Can I dismiss?",
];

type Turn = { q: string; a: ChatReply };

export default function DeskChat() {
  const path = usePathname();
  const { processes, casesByProcess, ledger, customizations } = useDesk();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);

  const world = useMemo(
    () => ({ path, processes, casesByProcess, ledger, customizations }),
    [path, processes, casesByProcess, ledger, customizations]
  );

  const ask = (q: string) => {
    const query = q.trim();
    if (!query) return;
    const a = answerChat(query, world);
    setTurns((prev) => [...prev, { q: query, a }]);
    setText("");
  };

  return (
    <div className={clsx("desk-chat", open && "open")}>
      {open && (
        <div className="desk-chat-panel" role="dialog" aria-label="Ask Desk">
          <div className="desk-chat-head">
            <div>
              <b>Ask Desk</b>
              <span>Deterministic · ranking, policy, packet. No model.</span>
            </div>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <div className="desk-chat-body">
            {turns.length === 0 && (
              <p className="foot">
                I will not auto-clear a hold or send money. I will tell you why a row is here and
                what the source system still owes.
              </p>
            )}
            {turns.map((turn, i) => (
              <div key={`${turn.q}-${i}`} className="desk-chat-turn">
                <p className="desk-chat-q">{turn.q}</p>
                <div className={clsx("desk-chat-a", turn.a.intent === "refuse" && "refuse")}>
                  <b>{turn.a.title}</b>
                  {turn.a.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {turn.a.href && (
                    <Link href={turn.a.href} className="btn">
                      Open
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="desk-chat-starters">
            {STARTERS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="desk-chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              ask(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask why this, what's missing, what posts back…"
              aria-label="Ask Desk"
            />
            <button type="submit" className="btn primary">
              Ask
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        className={clsx("desk-chat-fab", open && "on")}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide Ask Desk" : "Ask Desk"}
      </button>
    </div>
  );
}
