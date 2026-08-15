"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import DeskChat from "@/components/DeskChat";
import { useDesk } from "@/lib/desk";

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { workspace } = useDesk();
  const on = (href: string) =>
    href === "/"
      ? path === "/"
      : path === href || path.startsWith(`${href}/`);

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <svg className="mark" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <rect x="1" y="0" width="7" height="26" fill="var(--rust)" />
            <rect x="10" y="8" width="7" height="18" fill="var(--amber)" />
            <rect x="19" y="15" width="6" height="11" fill="var(--blue)" />
          </svg>
          <span>
            <span className="brand-name">Desk</span>
            <span className="brand-sub">Process OS · plug in a workflow, keep adding</span>
          </span>
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link href="/" className={clsx(on("/") && path === "/" && "on")}>
            Processes
          </Link>
          <Link href="/studio" className={clsx(on("/studio") && "on")}>
            Add process
          </Link>
          <Link href="/learn" className={clsx(on("/learn") && "on")}>
            Learn
          </Link>
          <Link href="/ledger" className={clsx(on("/ledger") && "on")}>
            Ledger
          </Link>
          <Link href="/workspace" className={clsx(on("/workspace") && "on")}>
            {workspace ? workspace.name : "Workspace"}
          </Link>
        </nav>
      </header>
      <div className="strip">
        <span>
          <b>Product</b> = the layer between source systems and how a team consumes work
        </span>
        <span>
          <b>Loop</b> = Identify · Prioritize · Act · Learn
        </span>
        <span>
          {workspace ? (
            <>
              <b>Shared</b> · {workspace.id}
            </>
          ) : (
            <>
              <b>Local</b> · share from Workspace when a teammate needs the same queue
            </>
          )}
        </span>
      </div>
      {children}
      <DeskChat />
    </div>
  );
}
