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
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight md:text-[28px]">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
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
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <p className="max-w-sm text-sm text-ink-2">{children}</p>}
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
  readonly tone?: "neutral" | "sky" | "positive" | "warning" | "wine";
  readonly icon?: ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-hover text-ink-2",
    sky: "bg-sky-soft text-sky-ink",
    positive: "bg-positive-soft text-positive",
    warning: "bg-warning-soft text-warning",
    wine: "bg-wine-soft text-wine",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold whitespace-nowrap",
        tones[tone],
      )}
    >
      {icon}
      {/* One flex item, so mixed text and amounts read as one phrase. */}
      <span>{children}</span>
    </span>
  );
}
