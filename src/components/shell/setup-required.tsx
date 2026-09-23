import { Database } from "lucide-react";

import type { SetupProblem } from "@/app/_server/context";

const EXPLANATIONS: Record<SetupProblem, { title: string; detail: string }> = {
  no_database: {
    title: "No FinPilot database yet",
    detail: "Create one with the demo ledger, then reload this page.",
  },
  not_migrated: {
    title: "The database has no tables yet",
    detail: "Run the migrations and seed the demo ledger, then reload this page.",
  },
  no_owner: {
    title: "The database is empty",
    detail: "Seed the demo ledger, then reload this page.",
  },
  multiple_owners: {
    title: "This database holds more than one owner",
    detail: "FinPilot V1 expects a single owner. Reset the demo ledger to continue.",
  },
};

/** Shown instead of the app when the local database is not ready. */
export function SetupRequired({ problem }: { readonly problem: SetupProblem }) {
  const { title, detail } = EXPLANATIONS[problem];
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-6">
      <div className="rounded-panel border border-line bg-surface p-7 shadow-panel">
        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-surface-hover">
          <Database className="size-5 text-ink-2" strokeWidth={1.75} />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-ink-2">{detail}</p>
        <pre className="mt-5 overflow-x-auto rounded-control bg-surface-subtle px-4 py-3 text-[13px] text-ink">
          npm run db:reset
        </pre>
      </div>
    </main>
  );
}
