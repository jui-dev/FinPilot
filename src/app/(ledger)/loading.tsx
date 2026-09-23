/** Shown while a ledger page is read from the database. */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-hidden>
      <div className="h-8 w-40 rounded-control bg-surface-hover" />
      <div className="h-14 rounded-panel border border-line bg-surface" />
      <div className="rounded-panel border border-line bg-surface">
        {Array.from({ length: 6 }, (_, row) => (
          <div
            key={row}
            className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0"
          >
            <div className="size-9 rounded-full bg-surface-hover" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 rounded bg-surface-hover" />
              <div className="h-2.5 w-24 rounded bg-surface-hover" />
            </div>
            <div className="h-3 w-16 rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    </div>
  );
}
