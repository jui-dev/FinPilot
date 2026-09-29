import { CalendarClock, CheckCircle2, Circle, CircleAlert, SkipForward } from "lucide-react";

import type { OccurrenceDisplayState } from "@/domain/commitments/occurrences";

import { cn } from "../ui/cn";
import { Tag } from "../ui/panel";

/**
 * A payment's state, worded and toned as Commitments words it: overdue is a
 * warning, due today is info, paid and skipped are quiet facts, and upcoming
 * is expected (an outline, per fact vs expectation, design-direction §5).
 */
const STATES: Record<
  OccurrenceDisplayState,
  { readonly label: string; readonly Icon: typeof Circle }
> = {
  overdue: { label: "Overdue", Icon: CircleAlert },
  due_today: { label: "Due today", Icon: CalendarClock },
  upcoming: { label: "Upcoming", Icon: Circle },
  paid: { label: "Paid", Icon: CheckCircle2 },
  skipped: { label: "Skipped", Icon: SkipForward },
};

export const dueStateLabel = (state: OccurrenceDisplayState): string => STATES[state].label;

export function DueTag({ state }: { readonly state: OccurrenceDisplayState }) {
  const { label, Icon } = STATES[state];
  const tone =
    state === "overdue"
      ? "warning"
      : state === "due_today" || state === "upcoming"
        ? "info"
        : "neutral";
  return (
    <Tag tone={tone} icon={<Icon aria-hidden className="size-3.5" />}>
      {label}
    </Tag>
  );
}

/** The compact form inside a day: the payment's name with its state as icon (and a word for assistive technology). */
export function DueChip({
  name,
  state,
  className,
}: {
  readonly name: string;
  readonly state: OccurrenceDisplayState;
  readonly className?: string;
}) {
  const { label, Icon } = STATES[state];
  return (
    <span
      title={`${name} · ${label}`}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-micro leading-none",
        state === "overdue" && "bg-warning-soft font-semibold text-warning",
        state === "due_today" && "bg-mist font-semibold text-ocean",
        state === "upcoming" && "text-ocean shadow-[inset_0_0_0_1px_var(--color-tide)]",
        state === "paid" &&
          "bg-surface-subtle text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]",
        state === "skipped" && "text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]",
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className={cn("truncate", state === "skipped" && "line-through")}>{name}</span>
      <span className="sr-only">, {label.toLowerCase()}</span>
    </span>
  );
}
