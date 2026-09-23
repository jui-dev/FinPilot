"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function LedgerError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Panel className="mx-auto max-w-[520px] p-6">
      <span aria-hidden className="grid size-10 place-items-center rounded-full bg-negative-soft">
        <TriangleAlert className="size-5 text-negative" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">This page could not be loaded</h1>
      <p className="mt-1.5 text-sm text-ink-2">
        Nothing was changed. Try again, and if it keeps happening check that the database is in
        place with <code className="text-ink">npm run db:reset</code>.
      </p>
      <div className="mt-5">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    </Panel>
  );
}
