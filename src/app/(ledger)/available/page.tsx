import type { Metadata } from "next";

import { CARD } from "@/components/commitments/occurrence-list";
import { AreaSwitch } from "@/components/shell/area-switch";
import { EmptyState } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Available" };

/**
 * The Available area's landing page. Its answer — the Available bridge — is
 * built in the next Stage 8 slice; until then the page shows no figure, so no
 * number appears without the breakdown that explains it (roadmap §1).
 */
export default function AvailablePage() {
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <AreaSwitch current="/available" />
      <header>
        <h1 className="text-title font-bold text-navy">Available</h1>
        <p className="mt-1 text-body text-ink-2">What you can use now, before new income.</p>
      </header>
      <section className={CARD} aria-label="Available">
        <EmptyState title="The breakdown is on its way">
          This page will show what you can use now: your balances, minus what you owe on cards,
          payments due soon and money set aside.
        </EmptyState>
      </section>
    </div>
  );
}
