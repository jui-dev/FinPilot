import type { Metadata } from "next";

import { GuideHero, GuideSteps, GuideWhere, GuideWords } from "@/components/guide/guide-sections";

export const metadata: Metadata = { title: "Guide" };

/**
 * How FinPilot works, step by step. It reads no data: every figure in it is an
 * example, so it never has to agree with the ledger.
 */
export default function GuidePage() {
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-8 md:gap-12">
      <GuideHero />
      <GuideSteps />
      <GuideWords />
      <GuideWhere />
    </div>
  );
}
