import Link from "next/link";

import type { CalendarDate } from "@/domain/calendar-date";
import type { ActivityItem } from "@/server/services/activity-service";

import { dayLabel } from "../format";
import { Glyph } from "../ledger/icons";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { describeEvent } from "./describe";

/**
 * Ledger events grouped by day, newest first. A row links to itself
 * (?tx=<id>), so the edit panel is server-rendered, linkable and closed by the
 * browser's Back button.
 */
export function ActivityList({
  items,
  today,
  hrefFor,
  perspectiveAccountId,
}: {
  readonly items: readonly ActivityItem[];
  readonly today: CalendarDate;
  readonly hrefFor: (id: string) => string;
  readonly perspectiveAccountId?: string | undefined;
}) {
  const days = new Map<CalendarDate, ActivityItem[]>();
  for (const item of items) {
    days.set(item.occurredOn, [...(days.get(item.occurredOn) ?? []), item]);
  }

  return (
    <div>
      {[...days].map(([day, dayItems]) => (
        <section key={day}>
          <h2 className="sticky top-14 z-10 flex items-baseline justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2 text-meta font-semibold text-ink-2 backdrop-blur md:px-5">
            {dayLabel(day, today)}
          </h2>
          <ul>
            {dayItems.map((item) => (
              <ActivityRow
                key={item.key}
                item={item}
                href={hrefFor(item.primary.id)}
                perspectiveAccountId={perspectiveAccountId}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ActivityRow({
  item,
  href,
  perspectiveAccountId,
}: {
  readonly item: ActivityItem;
  readonly href: string;
  readonly perspectiveAccountId?: string | undefined;
}) {
  const event = describeEvent(item, perspectiveAccountId);
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={href}
        scroll={false}
        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover md:gap-4 md:px-5"
      >
        <Glyph icon={event.icon} tone={event.tone} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{event.title}</span>
            {event.tag && <Tag tone={event.tag.tone}>{event.tag.label}</Tag>}
          </span>
          <span className="mt-0.5 block truncate text-meta text-ink-2">
            {event.meta.join(" · ")}
          </span>
        </span>
        <Money
          amount={event.amount}
          sign={event.sign}
          className={`shrink-0 text-body font-semibold ${event.amountClass}`}
        />
      </Link>
    </li>
  );
}
