import {
  ArrowRight,
  ChartLine,
  CircleGauge,
  CircleHelp,
  Lightbulb,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { SECTION_ICONS } from "../shell/nav-icons";
import { SECTIONS } from "../shell/navigation";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Tag } from "../ui/panel";
import {
  GUIDE_CYCLE,
  GUIDE_LEAD,
  GUIDE_STEPS,
  GUIDE_WORDS,
  guideStepId,
  type GuideStep,
} from "./content";
import { Illustration } from "./illustrations";
import { StepLink } from "./step-link";
import { StepRail } from "./step-rail";

/**
 * The Guide: how FinPilot works (the four-part idea), getting started in six
 * steps, the words the product uses, and where every page is
 * (docs/design-direction.md §6).
 */

const CARD = "rounded-panel border border-line-soft bg-surface shadow-card";
const CYCLE_ICONS = [PenLine, ShieldCheck, ChartLine, CircleGauge] as const;

/** How FinPilot works: the opening card, with Record → Verify → Understand → Available. */
export function GuideHero() {
  return (
    <section aria-labelledby="guide-title" className={cn(CARD, "p-5 md:p-7")}>
      <p className="inline-flex items-center gap-1.5 text-micro font-bold tracking-[0.08em] text-ocean uppercase">
        <CircleHelp aria-hidden className="size-3.5" strokeWidth={2} />
        Guide
      </p>
      <h1 id="guide-title" className="mt-1.5 text-title font-bold text-navy">
        How FinPilot works
      </h1>
      <p className="mt-2.5 max-w-[42rem] text-heading font-normal text-ink-2">{GUIDE_LEAD}</p>

      <ol
        aria-label="The four parts"
        className="mt-6 grid gap-1.5 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:gap-2.5"
      >
        {GUIDE_CYCLE.map((part, i) => {
          const Icon = CYCLE_ICONS[i]!;
          const goal = i === GUIDE_CYCLE.length - 1;
          return [
            <li
              key={part.title}
              className={cn(
                "grid grid-cols-[2.25rem_1fr] gap-x-3 rounded-panel p-3.5 lg:block lg:p-4",
                goal ? "bg-mist" : "border border-line-soft bg-surface-subtle",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "row-span-2 grid size-9 place-items-center rounded-[10px] bg-surface",
                  goal ? "text-navy" : "border border-line-soft text-ocean",
                )}
              >
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </span>
              <p className="text-heading font-bold text-navy lg:mt-3">
                <span className="sr-only">{i + 1}. </span>
                {part.title}
              </p>
              <p className="mt-0.5 text-meta text-ink-2">{part.text}</p>
            </li>,
            !goal && (
              <li
                key={`${part.title}-then`}
                aria-hidden
                className="grid place-items-center text-tide"
              >
                <ArrowRight className="size-[18px] rotate-90 lg:rotate-0" strokeWidth={1.75} />
              </li>
            ),
          ];
        })}
      </ol>
    </section>
  );
}

const stepId = guideStepId;

/** Getting started: the six steps as a row (desktop), then one card per step. */
export function GuideSteps() {
  return (
    <section aria-labelledby="guide-steps" className="flex flex-col gap-4 md:gap-5">
      <div>
        <h2 id="guide-steps" className="text-figure font-bold text-navy">
          Getting started
        </h2>
        <p className="mt-1 text-body text-ink-2">
          Six steps, in this order. Each one opens the page where you do it.
        </p>
      </div>

      <StepRail />

      <ol className="flex flex-col gap-3.5 md:gap-5">
        {GUIDE_STEPS.map((step, i) => (
          <StepCard key={step.title} step={step} n={i + 1} />
        ))}
      </ol>
    </section>
  );
}

function StepCard({ step, n }: { readonly step: GuideStep; readonly n: number }) {
  return (
    <li
      id={stepId(n)}
      aria-labelledby={`${stepId(n)}-title`}
      className={cn(
        CARD,
        "grid scroll-mt-24 items-center gap-5 p-4 md:p-7 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-10 lg:px-8",
      )}
    >
      <div>
        <p className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-navy text-body font-bold text-white">
            {n}
          </span>
          <span className="text-micro font-bold tracking-[0.08em] text-ocean uppercase">
            {step.when}
          </span>
        </p>
        <h3 id={`${stepId(n)}-title`} className="mt-3 text-figure font-bold text-navy">
          {step.title}
        </h3>
        <p className="mt-1.5 max-w-[34rem] text-body text-ink-2 md:text-[0.9375rem] md:leading-normal">
          {step.text}
        </p>
        <p className="mt-3.5 flex max-w-[34rem] gap-2.5 rounded-control bg-surface-subtle px-3.5 py-3 text-meta text-ink-2">
          <Lightbulb aria-hidden className="mt-px size-4 shrink-0 text-ocean" strokeWidth={1.75} />
          <span>
            <span className="font-semibold text-ink">Good to know: </span>
            {step.goodToKnow}
          </span>
        </p>
        <p className="mt-3.5">
          <StepLink label={step.link.label} to={step.link.to} />
        </p>
      </div>
      <Illustration kind={step.illustration} />
    </li>
  );
}

/** Words you'll see: the product's own terms, two columns from 768px. */
export function GuideWords() {
  return (
    <section aria-labelledby="guide-words" className={cn(CARD, "p-4 md:p-7")}>
      <h2 id="guide-words" className="text-figure font-bold text-navy">
        Words you&rsquo;ll see
      </h2>
      <dl className="mt-3 grid md:grid-cols-2 md:gap-x-8">
        {GUIDE_WORDS.map((word) => (
          <div key={word.term} className="border-t border-line-soft py-3.5">
            <dt className="flex flex-wrap items-center gap-2 text-body font-bold text-navy">
              {word.term}
              {word.tags?.map((t) => (
                <Tag key={t.label} tone={t.tone}>
                  {t.label}
                </Tag>
              ))}
            </dt>
            <dd className="mt-1 text-body text-ink-2">{word.meaning}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Where things are: every section and its pages, from the navigation itself. */
export function GuideWhere() {
  return (
    <section aria-labelledby="guide-where" className="flex flex-col gap-4">
      <h2 id="guide-where" className="text-figure font-bold text-navy">
        Where things are
      </h2>
      <div className={cn(CARD, "px-4 md:px-7")}>
        {SECTIONS.map((section) => {
          const Icon = SECTION_ICONS[section.label]!;
          return (
            <div
              key={section.label}
              className="grid gap-2 border-t border-line-soft py-4 first:border-t-0 md:grid-cols-[12rem_1fr] md:gap-4"
            >
              <h3 className="flex items-center gap-2.5 text-body font-bold text-navy">
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-control border border-line-soft bg-surface-subtle text-ocean"
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                {section.label}
              </h3>
              <ul className="flex flex-col gap-1.5 md:justify-center">
                {section.pages.map((page) => (
                  <li key={page.href} className="text-body">
                    <Link href={page.href} className={cn("font-semibold text-ink", linkClass)}>
                      {page.label}
                    </Link>
                    <span className="text-ink-2"> · {page.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
