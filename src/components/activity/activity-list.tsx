import Link from "next/link";

import type { CalendarDate } from "@/domain/calendar-date";
import type { ActivityItem } from "@/server/services/activity-service";

import { dayLabel } from "../format";
import { Glyph } from "../ledger/icons";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { describeEvent } from "./describe";

/**
 * One grid for the header and every row. Phones: glyph, the two-line
 * description, amount. Tablets: a Category column; the account moves under the
 * description. Desktop: Category and Account columns. The amount column has a
 * fixed width, so figures line up down the page.
 */
const COLUMNS =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] gap-x-3 md:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,11rem)_7.5rem] md:gap-x-5 lg:grid-cols-[2.25rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_9rem]";

/** Separates a row's parts for screen readers, which read the row as one link. */
const Pause = () => <span className="sr-only">, </span>;

/**
 * Ledger events grouped by day, newest first. A row links to itself
 * (?tx=<id>), so the edit panel is server-rendered, linkable and closed by the
 * browser's Back button; the open row is marked as the current one.
 */
export function ActivityList({
  items,
  today,
  hrefFor,
  perspectiveAccountId,
  openId,
}: {
  readonly items: readonly ActivityItem[];
  readonly today: CalendarDate;
  readonly hrefFor: (id: string) => string;
  readonly perspectiveAccountId?: string | undefined;
  /** The transaction open in the side panel. */
  readonly openId?: string | undefined;
}) {
  const days = new Map<CalendarDate, ActivityItem[]>();
  for (const item of items) {
    days.set(item.occurredOn, [...(days.get(item.occurredOn) ?? []), item]);
  }

  return (
    <div>
      {/* The column names are for sighted scanning; each row reads as one phrase.
          A warm band with small navy capitals: the list's structure, above the
          quieter day labels and never in the scope's cyan. */}
      <div
        aria-hidden
        className={cn(
          COLUMNS,
          "hidden border-b border-line-soft bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-mist)_80%,transparent)_0%,color-mix(in_srgb,var(--color-mist)_15%,transparent)_100%)] px-5 py-3 text-micro font-bold tracking-[0.08em] text-ocean uppercase md:grid",
        )}
      >
        <span className="col-start-2">Description</span>
        <span>Category</span>
        <span className="hidden lg:block">Account</span>
        <span className="text-right">Amount</span>
      </div>
      {[...days].map(([day, dayItems]) => (
        <section key={day}>
          {/* A warm band (opaque, as it sticks over the rows) with the day's count. */}
          <h3 className="sticky top-14 z-10 flex items-baseline justify-between gap-3 border-b border-line-soft bg-[linear-gradient(90deg,var(--color-surface-hover)_0%,var(--color-surface-subtle)_45%,var(--color-surface)_100%)] px-4 py-2 md:px-5">
            <span className="text-micro font-semibold tracking-[0.08em] text-navy uppercase">
              {dayLabel(day, today)}
            </span>
            <span className="text-micro font-medium text-ink-2">
              {dayItems.length === 1 ? "1 entry" : `${dayItems.length} entries`}
            </span>
          </h3>
          <ul>
            {dayItems.map((item) => (
              <ActivityRow
                key={item.key}
                item={item}
                href={hrefFor(item.primary.id)}
                perspectiveAccountId={perspectiveAccountId}
                open={item.primary.id === openId}
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
  open,
}: {
  readonly item: ActivityItem;
  readonly href: string;
  readonly perspectiveAccountId?: string | undefined;
  readonly open: boolean;
}) {
  const event = describeEvent(item, perspectiveAccountId);
  // Where a column already says it ("Card payment"), a tag would repeat it.
  const columnTag = event.tag && event.tag.label !== event.category ? event.tag : null;
  const AccountIcon = event.account.icon;
  // Without a description the title falls back to the category's name; the
  // category is then already said once, so it is not repeated beside it.
  const titledByCategory = !item.primary.description && event.title === event.category;
  const meta = titledByCategory ? event.meta.filter((part) => part !== event.category) : event.meta;
  return (
    <li className="border-b border-line-soft last:border-b-0">
      <Link
        href={href}
        scroll={false}
        aria-current={open ? "true" : undefined}
        className={cn(
          COLUMNS,
          // The inset outline stays inside the panel's clipped edge; the scroll
          // margin keeps a focused row clear of the header and the day band.
          "scroll-mt-24 items-center gap-y-0.5 px-4 py-3 transition-colors focus-visible:-outline-offset-2 md:px-5 md:py-2 lg:py-2.5",
          open ? "bg-mist" : "hover:bg-mist/25",
        )}
      >
        {/* The entry type's mark, as Quick Add and Categories draw it: expenses
            warm, income mist, transfers an ocean tint. The icon names the kind;
            direction is carried by the amount's sign, never red or green. */}
        <Glyph icon={event.icon} tone={event.tone} className="col-start-1 row-[1/3] md:size-8" />

        <span
          className={cn(
            "col-start-2 row-start-1 flex min-w-0 items-center gap-2 self-end",
            // Desktop without a note: one line, centred on the glyph.
            !event.detail && "lg:row-[1/3] lg:self-center",
          )}
        >
          <span className="truncate font-medium text-ink">{event.title}</span>
          {columnTag && (
            <span className="hidden shrink-0 md:inline-flex">
              <Tag tone={columnTag.tone}>{columnTag.label}</Tag>
            </span>
          )}
        </span>

        {/* Phones: the tag, then category and account, under the title. */}
        <span className="col-start-2 row-start-2 flex min-w-0 items-center gap-2 self-start text-meta text-ink-2 md:hidden">
          {event.tag && (
            <span className="shrink-0">
              <Tag tone={event.tag.tone}>{event.tag.label}</Tag>
            </span>
          )}
          <Pause />
          <span className="truncate">{meta.join(" · ")}</span>
        </span>

        {/* Tablets: the account under the title. Tablets and desktop: the note. */}
        <span
          className={cn(
            "col-start-2 row-start-2 hidden min-w-0 self-start truncate text-meta text-ink-2 md:block",
            !event.detail && "lg:hidden",
          )}
        >
          <span className="lg:hidden">
            <Pause />
            {event.account.label}
            {event.detail && " · "}
          </span>
          {event.detail && (
            <>
              <Pause />
              {event.detail}
            </>
          )}
        </span>

        <span className="col-start-3 row-[1/3] hidden min-w-0 self-center truncate text-body text-ink-2 md:block">
          {!titledByCategory && (
            <>
              <Pause />
              {event.category}
            </>
          )}
        </span>

        <span className="col-start-4 row-[1/3] hidden min-w-0 items-center gap-2 text-body text-ink-2 lg:flex">
          {AccountIcon && (
            <AccountIcon aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
          )}
          <Pause />
          <span className="truncate">{event.account.label}</span>
        </span>

        <span
          className={cn(
            // Phones: on the title's line. Wider: centred on the row, above any fee.
            "col-start-3 row-start-1 self-end text-right md:col-start-4 lg:col-start-5",
            !event.fee && "md:row-[1/3] md:self-center",
          )}
        >
          <Pause />
          <Money
            amount={event.amount}
            sign={event.sign}
            className={cn("text-body font-semibold", event.amountClass)}
          />
        </span>
        {event.fee && (
          <span className="col-start-3 row-start-2 self-start text-right text-micro text-ink-2 md:col-start-4 lg:col-start-5">
            <Pause />+<Money amount={event.fee} sign="none" /> fee
          </span>
        )}
      </Link>
    </li>
  );
}
