import type { ReactNode } from "react";

/** One Settings control: what it does on the left, its action on the right (stacked on phones). */
export function ControlRow({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:px-5">
      <div className="min-w-0">
        <h3 className="text-body font-semibold">{title}</h3>
        <p className="mt-0.5 max-w-prose text-meta text-ink-2">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
