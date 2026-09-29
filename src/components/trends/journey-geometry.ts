/**
 * The journey's drawing (Trends, Stage 12): Came in and Went out as one flat
 * step per month, the gap between them, and a Left over lane from a common
 * zero. Presentation geometry only — every amount is the read model's, and
 * nothing here adds money up; it maps amounts (minor units) to coordinates
 * and chooses which few of them carry a direct label.
 */

export interface JourneyMonth {
  readonly income: number;
  readonly spending: number;
  readonly leftOver: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Label {
  readonly x: number;
  readonly y: number;
  /** Index of the month whose amount it names. */
  readonly month: number;
}

export interface JourneyGeometry {
  readonly width: number;
  readonly height: number;
  /** Narrow drawings (phones) drop the end labels and tighten every band. */
  readonly compact: boolean;
  readonly plot: { readonly left: number; readonly right: number; readonly top: number };
  /** The y of zero in the flow. */
  readonly baseline: number;
  readonly ticks: readonly { readonly value: number; readonly y: number }[];
  /** One slot per month: its left edge, width and centre. */
  readonly slots: readonly {
    readonly x: number;
    readonly width: number;
    readonly centre: number;
  }[];
  /** True when slots are too narrow for "Sep": months are drawn by their initial. */
  readonly initials: boolean;
  readonly incomePath: string;
  readonly spendingPath: string;
  /** Under the Went out step, down to zero. */
  readonly wentOut: readonly Rect[];
  /** Between the two steps: left over, or more went out than came in. Null when equal. */
  readonly gaps: readonly ((Rect & { readonly kind: "left" | "over" }) | null)[];
  readonly monthLabelY: number;
  /** The highest Came in and Went out, when neither is the last month (which has end labels). */
  readonly peaks: { readonly income: Label | null; readonly spending: Label | null };
  /** Beside the last month, on wide drawings: where "Came in" and "Went out" are named. */
  readonly endLabels: {
    readonly x: number;
    readonly incomeY: number;
    readonly spendingY: number;
  } | null;
  readonly lane: {
    readonly top: number;
    readonly zero: number;
    readonly bars: readonly ((Rect & { readonly kind: "left" | "over" }) | null)[];
    /** Which months' Left over is written beside its bar. */
    readonly labelled: readonly boolean[];
  };
  /** Where the comparison halves are marked, beneath the lane. */
  readonly bracketY: number;
}

export const COMPACT_BELOW = 560;
/** ৳50,000 in minor units: the smallest grid step. */
const STEP = 5_000_000;
/** At most this many grid steps: larger amounts take a larger step (৳1L, ৳2L, ৳5L, ৳10L…). */
const MAX_STEPS = 4;

/**
 * The grid: from zero (or below, when an amount is negative) to a whole step
 * above the largest amount, with the smallest step on the ৳50k·1·2·5 ladder
 * that keeps it to MAX_STEPS.
 */
export function niceDomain(values: readonly number[]): {
  readonly lo: number;
  readonly hi: number;
  readonly step: number;
} {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = (step: number) => ({
    lo: min < 0 ? Math.floor(min / step) * step : 0,
    hi: Math.max(step, Math.ceil(max / step) * step),
    step,
  });
  for (let scale = 1; ; scale *= 10) {
    for (const m of [1, 2, 5]) {
      const d = span(STEP * m * scale);
      if ((d.hi - d.lo) / d.step <= MAX_STEPS) return d;
    }
  }
}

/** A grid label in lakh and thousand taka: "৳0", "৳50k", "৳1L", "৳1.5L", "−৳50k". */
export function axisAmount(minor: number): string {
  const taka = Math.abs(minor) / 100;
  const sign = minor < 0 ? "−" : "";
  if (taka === 0) return "৳0";
  return taka >= 1_00_000 ? `${sign}৳${taka / 1_00_000}L` : `${sign}৳${taka / 1_000}k`;
}

const indexOfMax = (values: readonly number[]) =>
  values.reduce((best, v, i) => (v > values[best]! ? i : best), 0);

export function journeyGeometry(months: readonly JourneyMonth[], width: number): JourneyGeometry {
  const compact = width < COMPACT_BELOW;
  const n = Math.max(1, months.length);
  const left = compact ? 38 : 56;
  const right = width - (compact ? 6 : 116);
  const top = 24;
  const flowHeight = compact ? 156 : 216;

  const { lo, hi, step: gridStep } = niceDomain(months.flatMap((m) => [m.income, m.spending]));
  const y = (v: number) => top + flowHeight - ((v - lo) / (hi - lo)) * flowHeight;
  const baseline = y(0);
  // Narrow drawings keep two or three grid lines.
  const tickStep = compact && (hi - lo) / gridStep > 2 ? gridStep * 2 : gridStep;
  const ticks: { value: number; y: number }[] = [];
  for (let v = lo; v <= hi; v += tickStep) ticks.push({ value: v, y: y(v) });

  const slot = (right - left) / n;
  const slots = months.map((_, i) => ({
    x: left + i * slot,
    width: slot,
    centre: left + i * slot + slot / 2,
  }));

  const step = (key: "income" | "spending") =>
    months
      .map(
        (m, i) =>
          (i === 0 ? `M${slots[0]!.x} ${y(m[key])}` : ` V${y(m[key])}`) + ` H${slots[i]!.x + slot}`,
      )
      .join("");
  const between = (a: number, b: number) => ({ y: Math.min(a, b), height: Math.abs(a - b) });

  const wentOut = months.map((m, i) => ({
    x: slots[i]!.x,
    width: slot,
    ...between(y(m.spending), baseline),
  }));
  const gaps = months.map((m, i) =>
    m.income === m.spending
      ? null
      : {
          x: slots[i]!.x,
          width: slot,
          ...between(y(m.income), y(m.spending)),
          kind: m.income > m.spending ? ("left" as const) : ("over" as const),
        },
  );

  const last = months.length - 1;
  const peakIncome = indexOfMax(months.map((m) => m.income));
  const peakSpending = indexOfMax(months.map((m) => m.spending));
  // A peak is labelled only when it rises above the latest month (whose
  // figures are always shown), and never on top of the other peak's label.
  const peak = (i: number, key: "income" | "spending"): Label | null =>
    months.length > 1 && months[i]![key] > 0 && months[i]![key] > months[last]![key]
      ? { x: slots[i]!.centre, y: y(months[i]![key]) - 7, month: i }
      : null;
  const income = peak(peakIncome, "income");
  let spending = peakSpending === peakIncome ? null : peak(peakSpending, "spending");
  if (
    income &&
    spending &&
    Math.abs(income.x - spending.x) < 72 &&
    Math.abs(income.y - spending.y) < 16
  )
    spending = null;
  const peaks = { income, spending };

  let endLabels: JourneyGeometry["endLabels"] = null;
  if (!compact && months.length > 0) {
    // Two lines of text each; keep them apart, the higher amount above.
    const incomeY = y(months[last]!.income);
    const spendingY = y(months[last]!.spending);
    const gap = 34;
    const incomeAbove = incomeY <= spendingY;
    const [a, b] = incomeAbove ? [incomeY, spendingY] : [spendingY, incomeY];
    const lower = Math.max(b, a + gap);
    endLabels = {
      x: right + 12,
      incomeY: incomeAbove ? a : lower,
      spendingY: incomeAbove ? lower : a,
    };
  }

  const monthLabelY = top + flowHeight + 18;
  const laneTop = monthLabelY + (compact ? 30 : 34);
  const laneHeight = compact ? 60 : 76;
  const labelRoom = 16;
  const positive = Math.max(0, ...months.map((m) => m.leftOver));
  const negative = Math.max(0, ...months.map((m) => -m.leftOver));
  const unit = positive + negative > 0 ? laneHeight / (positive + negative) : 0;
  const zero = laneTop + labelRoom + (positive + negative > 0 ? positive * unit : laneHeight / 2);
  const barWidth = Math.min(compact ? 18 : 30, slot * 0.5);
  const bars = months.map((m, i) =>
    m.leftOver === 0
      ? null
      : {
          x: slots[i]!.centre - barWidth / 2,
          width: barWidth,
          y: m.leftOver > 0 ? zero - m.leftOver * unit : zero,
          height: Math.abs(m.leftOver) * unit,
          kind: m.leftOver > 0 ? ("left" as const) : ("over" as const),
        },
  );
  // Every value when there is room; otherwise the ones that matter: the
  // latest, the largest, and every month in the minus.
  const roomy = slot >= (compact ? 44 : 64);
  const peakLeft = indexOfMax(months.map((m) => m.leftOver));
  const labelled = months.map((m, i) => roomy || i === last || i === peakLeft || m.leftOver < 0);

  const bracketY = laneTop + labelRoom * 2 + laneHeight + 10;
  return {
    width,
    height: bracketY + 26,
    compact,
    plot: { left, right, top },
    baseline,
    ticks,
    slots,
    initials: slot < 34,
    incomePath: step("income"),
    spendingPath: step("spending"),
    wentOut,
    gaps,
    monthLabelY,
    peaks,
    endLabels,
    lane: { top: laneTop, zero, bars, labelled },
    bracketY,
  };
}
