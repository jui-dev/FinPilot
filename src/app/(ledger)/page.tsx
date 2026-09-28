import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { AttentionList } from "@/components/attention/attention-list";
import { countLine } from "@/components/attention/describe";
import { getAttention } from "@/server/services/attention-service";

export const metadata: Metadata = { title: "Attention" };

/**
 * "/" — Attention's first home (roadmap Stage 9, P-4): what actually needs a
 * look right now, from the Attention read model. It is not a navigation
 * destination; the logo leads here. Stage 10 grows this route into the
 * Overview, which reuses the same list.
 */
export default async function AttentionPage() {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const signals = await getAttention(request.ctx);

  return (
    <div className="flex max-w-[880px] flex-col gap-5 md:gap-6">
      <header>
        {/* Takes focus after Hide, when the row that held it is gone. */}
        <h1
          id="attention-title"
          tabIndex={-1}
          className="text-title font-bold text-navy outline-none"
        >
          Attention
        </h1>
        {signals.length > 0 && (
          <p className="mt-1 text-body text-ink-2">{countLine(signals.length)}</p>
        )}
      </header>
      <AttentionList signals={signals} today={request.today} labelledBy="attention-title" />
    </div>
  );
}
