import { Archive, Pencil, Trash2 } from "lucide-react";

import type { CategoryKind } from "@/domain/ledger/transactions";

import { categoryIcon, Glyph } from "../ledger/icons";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/panel";
import { CategoryActions } from "./category-actions";
import { KIND_WORDS, type CategoryView } from "./describe";
import { KIND_STYLE } from "./kind-style";
import { NewCategoryButton } from "./new-category-button";

/**
 * One kind's categories in one card: those offered for new entries, then,
 * quieter under their own band, the archived ones. A row is the category and
 * what can be done with it — no counts: usage is told where it changes a
 * decision (the rename and archive dialogs), and Delete appears only when it
 * is allowed.
 */
export function CategoryList({
  kind,
  categories,
}: {
  readonly kind: CategoryKind;
  readonly categories: readonly CategoryView[];
}) {
  const words = KIND_WORDS[kind];
  const style = KIND_STYLE[kind];
  const byName = (a: CategoryView, b: CategoryView) => a.name.localeCompare(b.name);
  const active = categories.filter((c) => !c.archived).sort(byName);
  const archived = categories.filter((c) => c.archived).sort(byName);

  return (
    <section
      aria-labelledby="categories-kind"
      className="overflow-clip rounded-panel border border-line-soft bg-surface shadow-card"
    >
      {/* The kind, unmistakable: its direction mark and words, on its own wash. */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line-soft px-4 py-4 md:px-6",
          style.wash,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className={cn("grid size-11 shrink-0 place-items-center rounded-full", style.mark)}
          >
            <style.icon className="size-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">
              {style.flow}
            </p>
            <h2 id="categories-kind" className="text-heading font-bold text-navy">
              {words.title}
            </h2>
            <p className="text-meta text-ink-2">{words.note}</p>
          </div>
        </div>
        <NewCategoryButton kind={kind} />
      </div>

      {active.length === 0 ? (
        <EmptyState title={`No active ${words.title}`}>
          Add one so {words.entries} can be recorded.
        </EmptyState>
      ) : (
        <ul aria-label={`Offered for ${words.entries}`}>
          {active.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <section aria-labelledby="categories-archived">
          <h3
            id="categories-archived"
            className="border-y border-line-soft bg-[linear-gradient(90deg,var(--color-surface-hover)_0%,var(--color-surface-subtle)_45%,var(--color-surface)_100%)] px-4 py-2.5 text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase md:px-6"
          >
            Archived
            <span className="ml-2 font-medium tracking-normal normal-case">
              Kept on past records, not offered for {words.entries}
            </span>
          </h3>
          <ul>
            {archived.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="border-t border-line-soft px-4 py-3 text-meta text-ink-2 md:px-6">
          No archived {words.title}.
        </p>
      )}
    </section>
  );
}

function CategoryRow({ category }: { readonly category: CategoryView }) {
  return (
    <li className="flex min-h-16 items-center gap-3 border-b border-line-soft px-4 py-2.5 transition-colors last:border-b-0 hover:bg-canvas md:px-6">
      <Glyph
        icon={categoryIcon(category.name)}
        tone={category.archived ? "neutral" : KIND_STYLE[category.kind].glyph}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-semibold",
          category.archived ? "text-ink-2" : "text-ink",
        )}
      >
        {category.name}
      </span>
      <CategoryActions view={category} />
    </li>
  );
}

/**
 * The three rules in a sentence each: why Delete is sometimes missing, and
 * what renaming and archiving do to what is already recorded.
 */
export function CategoryGuide({ kind }: { readonly kind: CategoryKind }) {
  const rules = [
    {
      icon: Pencil,
      title: "Rename",
      text: "Past records show the new name. Amounts and balances don't change.",
    },
    {
      icon: Archive,
      title: "Archive",
      text: `Stops a category being offered for ${KIND_WORDS[kind].entries}. Past records keep it, and it can be restored.`,
    },
    {
      icon: Trash2,
      title: "Delete",
      text: "Only for a category nothing has used, so no record ever loses its category.",
    },
  ];
  return (
    <aside
      aria-labelledby="categories-guide"
      className="rounded-panel bg-surface-subtle px-5 py-5 shadow-[inset_0_0_0_1px_var(--color-line-soft)] md:px-6"
    >
      <h2 id="categories-guide" className="text-body font-bold text-navy">
        How categories work
      </h2>
      <dl className="mt-4 flex flex-col gap-4">
        {rules.map((rule) => (
          <div key={rule.title} className="flex gap-3">
            <rule.icon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-ink-3"
              strokeWidth={1.75}
            />
            <div>
              <dt className="text-meta font-semibold text-ink">{rule.title}</dt>
              <dd className="mt-0.5 text-meta text-ink-2">{rule.text}</dd>
            </div>
          </div>
        ))}
      </dl>
    </aside>
  );
}
