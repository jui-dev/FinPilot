import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CreditCard,
  Landmark,
  PiggyBank,
  Repeat,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { formatMoney, fromMajor } from "@/domain/money";

import { cn } from "../ui/cn";
import { Tag } from "../ui/panel";
import { exampleAvailable, GUIDE_AVAILABLE_EXAMPLE, type GuideIllustration } from "./content";

/**
 * Small drawings of what each step's page shows: simplified, with example
 * figures, never a screenshot and never the person's own numbers. They are
 * decoration (the step's words carry the meaning), so they are hidden from
 * assistive technology.
 */
export function Illustration({ kind }: { readonly kind: GuideIllustration }) {
  return (
    <div
      aria-hidden
      className="rounded-panel border border-line-soft bg-surface-subtle p-3.5 select-none md:p-5"
    >
      <div className="rounded-control bg-surface px-4 py-3.5 shadow-card">{DRAWINGS[kind]}</div>
    </div>
  );
}

const taka = (major: number) => formatMoney(fromMajor(major));

function Row({
  icon: Icon,
  name,
  detail,
  end,
}: {
  readonly icon?: LucideIcon;
  readonly name: string;
  readonly detail?: string;
  readonly end: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line-soft py-2 first:border-t-0">
      <span className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-control border border-line-soft bg-surface-subtle text-ocean">
            <Icon className="size-3.5" strokeWidth={1.75} />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold text-ink">{name}</span>
          {detail && <span className="block truncate text-micro text-ink-2">{detail}</span>}
        </span>
      </span>
      <span className="shrink-0 text-body font-semibold text-ink tabular-nums">{end}</span>
    </div>
  );
}

const Chip = ({
  children,
  tone,
}: {
  readonly children: ReactNode;
  readonly tone: "soft" | "quiet";
}) => (
  <span
    className={cn(
      "inline-flex h-7 items-center rounded-control px-3 text-meta font-semibold",
      tone === "soft" ? "bg-mist text-navy" : "border border-line bg-surface text-ink-2",
    )}
  >
    {children}
  </span>
);

function Meter({ parts }: { readonly parts: ReadonlyArray<{ share: number; className: string }> }) {
  return (
    <div className="mt-1.5 mb-1 flex h-2 overflow-hidden rounded-full bg-surface-subtle">
      {parts.map((p, i) => (
        <i key={i} className={cn("block", p.className)} style={{ flexGrow: p.share }} />
      ))}
    </div>
  );
}

const DRAWINGS: Record<GuideIllustration, ReactNode> = {
  accounts: (
    <>
      <Row icon={Wallet} name="Cash" detail="Everyday money" end={taka(4_200)} />
      <Row icon={Landmark} name="City Bank" detail="Everyday money" end={taka(1_02_800)} />
      <Row icon={Smartphone} name="bKash" detail="Everyday money" end={taka(13_000)} />
      <Row icon={CreditCard} name="Visa card" detail="Credit card" end={`${taka(18_000)} owed`} />
    </>
  ),
  record: (
    <>
      <div className="grid grid-cols-3 gap-1 rounded-control bg-surface-subtle p-1">
        {(
          [
            ["Expense", ArrowUpRight, true],
            ["Income", ArrowDownLeft, false],
            ["Transfer", ArrowLeftRight, false],
          ] as const
        ).map(([label, Icon, on]) => (
          <span
            key={label}
            className={cn(
              "flex items-center justify-center gap-1 rounded-[6px] py-1.5 text-meta font-semibold",
              on ? "bg-surface text-navy shadow-chip" : "text-ink-2",
            )}
          >
            <Icon className="size-3.5" strokeWidth={2} />
            {label}
          </span>
        ))}
      </div>
      <p className="mt-4 text-center text-display font-bold text-navy tabular-nums">{taka(450)}</p>
      <p className="mt-1 text-center text-meta text-ink-2">
        Cash · {taka(4_200)} › <span className="font-semibold text-ink">{taka(3_750)}</span>
      </p>
      <div className="mt-3 flex justify-between gap-3 border-t border-line-soft pt-2.5">
        <span>
          <span className="block text-body font-semibold">Food &amp; Dining</span>
          <span className="block text-micro text-ink-2">Category</span>
        </span>
        <span className="text-right">
          <span className="block text-body font-semibold">Cash</span>
          <span className="block text-micro text-ink-2">Paid from</span>
        </span>
      </div>
      <div className="mt-2.5 grid h-9 place-items-center rounded-control bg-navy text-body font-semibold text-white">
        Save expense
      </div>
    </>
  ),
  verify: (
    <>
      <Row
        icon={Wallet}
        name="Cash"
        detail={`Recorded ${taka(3_750)}`}
        end={<Chip tone="soft">Verify</Chip>}
      />
      <Row name="What you counted" detail="Today" end={taka(3_700)} />
      <Row name="Difference" detail="Recorded as an adjustment" end={`−${taka(50)}`} />
      <Row name="Status" end={<Tag tone="positive">Verified · today</Tag>} />
    </>
  ),
  commitments: (
    <>
      <Row
        icon={Repeat}
        name="Rent"
        detail={`Due on the 1st · ${taka(25_000)}`}
        end={
          <span className="flex gap-1.5">
            <Chip tone="quiet">Skip</Chip>
            <Chip tone="soft">Pay</Chip>
          </span>
        }
      />
      <Row
        icon={Repeat}
        name="Internet"
        detail={taka(1_500)}
        end={<Tag tone="warning">Due today</Tag>}
      />
      <Row
        icon={Repeat}
        name="Phone bill"
        detail={taka(6_000)}
        end={<Tag tone="info">Due in 12 days</Tag>}
      />
    </>
  ),
  "set-aside": (
    <>
      <Row icon={PiggyBank} name="Emergency cushion" detail="in City Bank" end={taka(20_000)} />
      <Meter parts={[{ share: 100, className: "bg-ocean" }]} />
      <div className="mt-2" />
      <Row
        icon={PiggyBank}
        name="New laptop"
        detail={`in bKash · target ${taka(50_000)}`}
        end={taka(5_000)}
      />
      <Meter
        parts={[
          { share: 7, className: "bg-ocean" },
          { share: 3, className: "bg-negative" },
          { share: 40, className: "" },
        ]}
      />
      <p className="mt-2 text-right">
        <Tag tone="negative">{taka(1_500)} short</Tag>
      </p>
    </>
  ),
  available: <AvailableExample />,
};

/** Available worked out from the example, step by step, as the Available page reads it. */
export function AvailableExample() {
  const e = GUIDE_AVAILABLE_EXAMPLE;
  const available = exampleAvailable();
  const steps = [
    {
      label: "In your accounts",
      note: "Cash, bank and mobile wallets that count",
      amount: taka(e.inAccounts),
    },
    {
      label: "Owed on cards",
      note: "What your credit cards owe",
      amount: `−${taka(e.owedOnCards)}`,
    },
    {
      label: "Due in the next 30 days",
      note: "Your commitments, overdue ones included",
      amount: `−${taka(e.dueSoon)}`,
    },
    {
      label: "Set aside from Available",
      note: "Money you're keeping for a purpose",
      amount: `−${taka(e.setAside)}`,
    },
  ];
  const bar = [
    { label: "Cards", share: e.owedOnCards, className: "bg-ocean" },
    { label: "Due", share: e.dueSoon, className: "bg-tide" },
    { label: "Set aside", share: e.setAside, className: "bg-line" },
    { label: "Available", share: available, className: "bg-navy" },
  ];
  return (
    <div>
      {steps.map((s, i) => (
        <div
          key={s.label}
          className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-line-soft py-2"
        >
          <span>
            <span className="block text-body text-ink">{s.label}</span>
            <span className="block text-micro text-ink-2">{s.note}</span>
          </span>
          <span
            className={cn(
              "text-body font-semibold tabular-nums",
              i > 0 ? "text-ink-2" : "text-ink",
            )}
          >
            {s.amount}
          </span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 pt-3">
        <span className="text-heading font-bold text-navy">Available</span>
        <span className="text-figure font-bold text-navy tabular-nums">{taka(available)}</span>
      </div>
      <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {bar.map((b) => (
          <i key={b.label} className={cn("block", b.className)} style={{ flexGrow: b.share }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-micro text-ink-2">
        {bar.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1.5">
            <i className={cn("inline-block size-2.5 rounded-[3px]", b.className)} />
            {b.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-micro text-ink-2">An example, not your numbers.</p>
    </div>
  );
}
