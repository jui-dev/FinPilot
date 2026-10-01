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
