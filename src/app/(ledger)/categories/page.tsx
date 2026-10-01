import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { CategoryGuide, CategoryList } from "@/components/categories/category-list";
import type { CategoryView } from "@/components/categories/describe";
import { KindSwitch } from "@/components/categories/kind-switch";
import type { CategoryKind } from "@/domain/ledger/transactions";
import {
  getCategories,
  getCategoryReferenceCounts,
  getCategoryUsage,
} from "@/server/services/setup-service";

export const metadata: Metadata = { title: "Categories" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The one place categories are managed: Expense Categories and Income
 * Categories, one kind at a time (`?kind=income`; expense at the bare path).
 * Whether a category can be deleted, and whether it is its kind's last active
 * one, are decided here from the server's facts; the server enforces both
 * again on every change.
 */
export default async function CategoriesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx } = request;
  const params = await searchParams;
  const kind: CategoryKind = params.kind === "income" ? "income" : "expense";

  const [categories, usage, references] = await Promise.all([
    getCategories(ctx),
    getCategoryUsage(ctx),
    getCategoryReferenceCounts(ctx),
  ]);
  const ofKind = categories.filter((c) => c.kind === kind);
  const activeCount = ofKind.filter((c) => c.archivedAt === null).length;

  const views: CategoryView[] = ofKind.map((category) => {
    const archived = category.archivedAt !== null;
    const lastActive = !archived && activeCount === 1;
    return {
      id: category.id,
      name: category.name,
      kind: category.kind,
      archived,
      records: usage.get(category.id)?.records ?? 0,
      commitments: usage.get(category.id)?.commitments ?? [],
      deletable: (references.get(category.id) ?? 0) === 0 && !lastActive,
      lastActive,
    };
  });

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      {/* The title, then the kind on screen at the line's end. */}
      <header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <h1 className="mr-3 text-title font-bold text-navy">Categories</h1>
          <div className="ml-auto">
            <KindSwitch current={kind} />
          </div>
        </div>
        <p className="mt-2 text-body text-ink-2">
          Every expense and income you record belongs to one category.
        </p>
      </header>

      <div className="grid items-start gap-5 md:gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <CategoryList kind={kind} categories={views} />
        <CategoryGuide kind={kind} />
      </div>
    </div>
  );
}
