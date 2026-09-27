import type { ReactNode } from "react";

import { cn } from "./cn";

/** A conceptual unit on a page: white surface, hairline border, 12px radius. */
export function Panel({
  children,
  className,
  as: Tag = "section",
  labelledBy,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly as?: "section" | "div" | "aside";
  readonly labelledBy?: string;
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={cn("rounded-panel border border-line bg-surface shadow-panel", className)}
    >
      {children}
    </Tag>
  );
}

/**
 * The title row of a panel: the question it answers, and optionally a short
 * note (its scope or ordering) or other content beside it. Wraps on phones.
 */
export function PanelHeader({
  id,
  title,
  note,
  children,
}: {
  /** Referenced by the Panel's `labelledBy`. */
  readonly id?: string;
  readonly title: ReactNode;
  readonly note?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3 md:px-5">
      <h2 id={id} className="text-heading font-semibold">
        {title}
      </h2>
      {note && <p className="text-meta text-ink-2">{note}</p>}
      {children}
    </div>
  );
}

/** A labelled band between groups of rows inside a panel ("Higher", "Lower"). */
export function PanelBand({ children }: { readonly children: ReactNode }) {
  return (
    <h3 className="border-y border-line bg-surface-subtle px-4 py-2 text-meta font-semibold text-ink-2 md:px-5">
      {children}
    </h3>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-title font-semibold">{title}</h1>
        {description && <p className="mt-1 text-body text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  readonly title: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-heading font-semibold">{title}</p>
      {children && <p className="max-w-sm text-body text-ink-2">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * A small neutral or semantic label ("Card payment", "Refund", "Archived").
 * A status passes an icon too: status is always icon + word + colour
 * (docs/design-direction.md §2).
 */
export function Tag({
  children,
  tone = "neutral",
  icon,
}: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "info" | "positive" | "warning";
  readonly icon?: ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-hover text-ink-2",
    info: "bg-mist text-ocean",
    positive: "bg-positive-soft text-positive",
    warning: "bg-warning-soft text-warning",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-micro font-semibold whitespace-nowrap",
        tones[tone],
      )}
    >
      {icon}
      {/* One flex item, so mixed text and amounts read as one phrase. */}
      <span>{children}</span>
    </span>
  );
}
