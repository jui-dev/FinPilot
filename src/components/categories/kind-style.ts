import { ArrowDownLeft, ArrowUpRight, type LucideIcon } from "lucide-react";

import type { CategoryKind } from "@/domain/ledger/transactions";

import type { GlyphTone } from "../ledger/icons";

/**
 * How the two kinds look, from the families the palette already gives money
 * leaving and arriving (docs/design-direction.md §2): Expense is the warm
 * spending family (soft coral tints, never solid coral), Income the cool
 * family that draws Came in (mist and tide). Never red or green. Colour only
 * repeats what the words and the arrow already say: out ↗ for Expense, in ↙
 * for Income.
 */
export const KIND_STYLE: Readonly<
  Record<
    CategoryKind,
    {
      /** The direction money moves, as a mark. */
      readonly icon: LucideIcon;
      /** The direction in words, beside the mark. */
      readonly flow: string;
      /** The kind's round mark: its tint, with an ink-legible icon. */
      readonly mark: string;
      /** The switch's selected option. */
      readonly selected: string;
      /** The card header's one quiet wash from its top-left corner. */
      readonly wash: string;
      /** The tone of each active row's category icon. */
      readonly glyph: GlyphTone;
    }
  >
> = {
  expense: {
    icon: ArrowUpRight,
    flow: "Money out",
    mark: "bg-[color-mix(in_srgb,var(--color-coral)_18%,var(--color-surface-hover))] text-ink",
    selected:
      "bg-[color-mix(in_srgb,var(--color-coral)_12%,var(--color-surface))] text-ink shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-coral)_55%,var(--color-line-strong))]",
    wash: "bg-[radial-gradient(120%_180%_at_0%_0%,color-mix(in_srgb,var(--color-coral)_10%,var(--color-surface-subtle))_0%,var(--color-surface)_60%)]",
    glyph: "warm",
  },
  income: {
    icon: ArrowDownLeft,
    flow: "Money in",
    mark: "bg-mist text-ocean",
    selected: "bg-mist text-ocean shadow-[0_0_0_1px_var(--color-ocean)]",
    wash: "bg-[radial-gradient(120%_180%_at_0%_0%,color-mix(in_srgb,var(--color-mist)_75%,var(--color-surface))_0%,var(--color-surface)_60%)]",
    glyph: "info",
  },
};
