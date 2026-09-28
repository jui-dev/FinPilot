import type { Metadata } from "next";
import Link from "next/link";

import { getRequestContext } from "@/app/_server/context";
import { AnswerCard } from "@/components/available/answer-card";
import { Evidence } from "@/components/available/evidence";
import { AreaSwitch } from "@/components/shell/area-switch";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/panel";
import { getAvailable } from "@/server/services/available-service";

export const metadata: Metadata = { title: "Available" };

/**
 * "How much can I actually use right now, and why?" The answer first, then
 * how it is worked out, then the rows behind it. Every figure is the
 * Available read model's (docs/domain-model.md §10); nothing is added up here.
 */
export default async function AvailablePage() {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const view = await getAvailable(request.ctx);

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <AreaSwitch current="/available" />
      <header>
        <h1 className="text-title font-bold text-navy">Available</h1>
        <p className="mt-1 text-body text-ink-2">What you can use now, before new income.</p>
      </header>
      {view.accounts.length === 0 ? (
        <section
          className="rounded-panel border border-line bg-surface shadow-card"
          aria-label="Available"
        >
          <EmptyState
            title="No accounts yet"
            action={
              <Link href="/accounts" className={buttonClass("primary", "sm")}>
                Go to Accounts
              </Link>
            }
          >
            Add the accounts you use and FinPilot works out what you can use now.
          </EmptyState>
        </section>
      ) : (
        <>
          <AnswerCard view={view} />
          <Evidence view={view} />
        </>
      )}
    </div>
  );
}
