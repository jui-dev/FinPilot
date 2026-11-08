import {
  CircleGauge,
  PenLine,
  PiggyBank,
  Repeat,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { GUIDE_STEPS, guideStepId, type GuideIllustration } from "./content";

/** Each step's icon: the one its page already has in the navigation (Record: the pen of the four parts). */
const ICONS: Record<GuideIllustration, LucideIcon> = {
  accounts: Wallet,
  record: PenLine,
  verify: ShieldCheck,
  commitments: Repeat,
  "set-aside": PiggyBank,
  available: CircleGauge,
};

/**
 * The six steps as a rail of icons from start to answer, each linking to its
 * card; Available, where the steps lead, sits on mist. On phones each step
 * keeps a readable width and the rail scrolls sideways, edge to edge, like a
 * section's row.
 */
export function StepRail() {
  const count = GUIDE_STEPS.length;
  // The rail runs between the first and last icons' centres (each column is 1/count wide).
  const inset = `calc(100% / ${count * 2})`;
  return (
    <nav
      aria-label="Steps"
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0"
    >
      <ol
        className="relative grid min-w-[27rem] md:min-w-0"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        <span
          aria-hidden
          className="absolute top-[19px] h-0.5 bg-line md:top-[22px]"
          style={{ left: inset, right: inset }}
        />
        {GUIDE_STEPS.map((step, i) => {
          const n = i + 1;
          const Icon = ICONS[step.illustration];
          const goal = n === count;
          return (
            <li key={step.title} className="relative">
              <a
                href={`#${guideStepId(n)}`}
                className="group flex flex-col items-center gap-1 rounded-control px-1 pb-1 text-center outline-offset-2 md:px-1.5"
              >
                <span
                  className={
                    goal
                      ? "mb-1 grid size-[38px] place-items-center rounded-full border-[1.5px] border-transparent bg-mist text-navy shadow-[0_0_0_4px_var(--color-canvas)] transition-colors group-hover:border-navy md:mb-1.5 md:size-11 md:shadow-[0_0_0_6px_var(--color-canvas)]"
                      : "mb-1 grid size-[38px] place-items-center rounded-full border-[1.5px] border-line bg-surface text-ocean shadow-[0_0_0_4px_var(--color-canvas)] transition-colors group-hover:border-navy group-hover:text-navy md:mb-1.5 md:size-11 md:shadow-[0_0_0_6px_var(--color-canvas)]"
                  }
                >
                  <Icon aria-hidden className="size-4 md:size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="hidden text-micro font-bold tracking-[0.08em] text-ink-3 uppercase md:block">
                  Step {n}
                </span>
                <span className="text-micro font-semibold whitespace-nowrap text-ink group-hover:text-navy md:text-body md:font-bold">
                  <span className="sr-only">Step {n}: </span>
                  {step.short}
                </span>
                <span className="hidden text-micro text-ink-2 md:block">{step.when}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
