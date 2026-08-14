"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const on = (href: string) =>
    href === "/"
      ? path === "/"
      : path === href || path.startsWith(`${href}/`);

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="mark" aria-hidden />
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
          <Link href="/ledger" className={clsx(on("/ledger") && "on")}>
            Ledger
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
          <b>Customize</b> = columns, ranking, actions — per process
        </span>
      </div>
      {children}
    </div>
  );
}
