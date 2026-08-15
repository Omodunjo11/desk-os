# Desk

Process OS for high-stakes work queues. Overlay on core banking, IBM OpenPages, transaction monitoring, or MES. Desk is not a fifth system of record.

Loop: **Identify → Prioritize → Act → Learn**. Severity is not priority. Need more is a packet of asks. Holds cannot auto-clear.

```bash
npm install
npm run dev
npm run eval
```

Open http://localhost:3000 or https://desk-os-pi.vercel.app. Use a private window so seed data is clean.

Eval: 117 checks (deep intake, locked holds, Need more packet, deterministic chat, park-with-owner). Ask Desk has no model. Write-back is labels only.

## 12-minute walkthrough

Say the thesis once, then click. Do not narrate architecture.

**0:00 — Open.** “This is the overlay, not a fifth system of record. You walk into a ranked board. Holds sit above score. Desk will not auto-release money.”

**1:00 — Board.** Point at packet 01: *Outgoing wire held on OFAC near-match*. Read the amber ask: second identifier (legal name, address, or DBA). Then is the rest of the hold list. Need more is incomplete packets. Desks are counts, not marketing cards.

**3:00 — Open packet.** Click **Open packet**. Rust bar = hold. Ask is on the case. Evidence: screening 0.81, same beneficiary paid 14 times, 11-year relationship. “Priority is look-now. Severity is harm-if-true. They are not the same.”

**4:30 — Ask Desk.** Open **Ask Desk** (no model). Click **What’s missing?** then type `just dismiss the OFAC and auto-release the wire`. It refuses. Type `why is this first?` so they see ranking, not a chatbot.

**6:30 — Park.** Owner `Priya RM`. **Park with owner**. Back on the queue the OFAC is still open, parked, not gone. “Monitor stays in the queue. Done would be a lie.”

**8:00 — Learn.** `/learn` → **Apply sample week**. Mule noise is a retune candidate. Elder stays **do-not-touch**. “False positives become a pack for the TM system. Holds and elder cannot be tuned off. Desk still does not auto-clear.”

**10:30 — Close.** “Would you walk into this on Monday instead of the source queue?” If yes: one export (Actimize, OpenPages, core, or MES) and we map it. If “I already know my top case,” this overlay is not for that desk.

If the board is dirty from a prior click-through, private window or clear site data for this origin.
