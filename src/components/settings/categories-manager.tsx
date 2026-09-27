"use client";

import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import {
  addCategoryAction,
  archiveCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
  restoreCategoryAction,
} from "@/app/_server/actions";
import type { CategoryKind } from "@/domain/ledger/transactions";

import { categoryIcon, Glyph } from "../ledger/icons";
import { Button } from "../ui/button";
import { controlClass } from "../ui/field";
import { cn } from "../ui/cn";
import { EmptyState, Panel, Tag } from "../ui/panel";
import { useToast } from "../ui/toast";

export interface CategoryView {
  readonly id: string;
  readonly name: string;
  readonly kind: CategoryKind;
  readonly archived: boolean;
  readonly uses: number;
}

/**
 * Categories in use are archived, never deleted, so history keeps its meaning
 * (docs/domain-model.md §6). Delete appears only for a category nothing uses.
 */
export function CategoriesManager({
  categories,
}: {
  readonly categories: readonly CategoryView[];
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <CategoryGroup
        kind="expense"
        title="Spending categories"
        note="What the money was for."
        categories={categories.filter((c) => c.kind === "expense")}
      />
      <CategoryGroup
        kind="income"
        title="Income categories"
        note="Where money comes from."
        categories={categories.filter((c) => c.kind === "income")}
      />
    </div>
  );
}

function CategoryGroup({
  kind,
  title,
  note,
  categories,
}: {
  readonly kind: CategoryKind;
  readonly title: string;
  readonly note: string;
  readonly categories: readonly CategoryView[];
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const add = async () => {
    setPending(true);
    setError(null);
    const result = await addCategoryAction({ name, kind });
    setPending(false);
    if (!result.ok) {
      setError(result.fieldErrors.name ?? result.message);
      return;
    }
    toast({ message: `${name.trim()} added.` });
    setName("");
  };

  const sorted = [...categories].sort(
    (a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name),
  );

  return (
    <Panel className="flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <p className="text-[12.5px] text-ink-2">{note}</p>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="No categories yet">Add the first one below.</EmptyState>
      ) : (
        <ul className="flex-1">
          {sorted.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-1.5 border-t border-line px-4 py-3 md:px-5"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New category"
            aria-label={`New ${kind} category`}
            aria-invalid={error ? true : undefined}
            maxLength={40}
            className={cn(controlClass, "h-9 text-[13px]", error && "border-negative")}
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            pending={pending}
            disabled={name.trim() === ""}
            icon={<Plus className="size-4" strokeWidth={2.25} />}
          >
            Add
          </Button>
        </div>
        {error && <p className="text-[13px] text-negative">{error}</p>}
      </form>
    </Panel>
  );
}

function CategoryRow({ category }: { readonly category: CategoryView }) {
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const act = async (run: () => Promise<{ ok: boolean; message?: string }>, done: string) => {
    setPending(true);
    const result = await run();
    setPending(false);
    toast({
      message: result.ok ? done : (result.message ?? "That did not work."),
      tone: result.ok ? "default" : "error",
    });
    return result.ok;
  };

  const rename = async () => {
    setError(null);
    const result = await renameCategoryAction(category.id, name);
    if (!result.ok) {
      setError(result.fieldErrors.name ?? result.message);
      return;
    }
    setRenaming(false);
    toast({ message: "Category renamed." });
  };

  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 md:px-5">
      <Glyph icon={categoryIcon(category.name)} />
      {renaming ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void rename();
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Category name"
            aria-invalid={error ? true : undefined}
            maxLength={40}
            autoFocus
            className={cn(controlClass, "h-8 text-[13px]", error && "border-negative")}
          />
          <Button type="submit" variant="ghost" size="sm" icon={<Check className="size-4" />}>
            <span className="sr-only">Save name</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="size-4" />}
            onClick={() => {
              setRenaming(false);
              setName(category.name);
              setError(null);
            }}
          >
            <span className="sr-only">Cancel</span>
          </Button>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn("truncate font-medium", category.archived && "text-ink-2")}>
                {category.name}
              </span>
              {category.archived && <Tag>Archived</Tag>}
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-2">
              {category.uses === 0
                ? "Not used yet"
                : `${category.uses} ${category.uses === 1 ? "transaction" : "transactions"}`}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            {!category.archived && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil className="size-4" />}
                onClick={() => setRenaming(true)}
                title="Rename"
              >
                <span className="sr-only">Rename {category.name}</span>
              </Button>
            )}
            {category.archived ? (
              <Button
                variant="ghost"
                size="sm"
                pending={pending}
                icon={<ArchiveRestore className="size-4" />}
                onClick={() =>
                  void act(() => restoreCategoryAction(category.id), `${category.name} restored.`)
                }
              >
                Restore
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                pending={pending}
                icon={<Archive className="size-4" />}
                onClick={() =>
                  void act(() => archiveCategoryAction(category.id), `${category.name} archived.`)
                }
                title="Archive"
              >
                <span className="sr-only">Archive {category.name}</span>
              </Button>
            )}
            {category.uses === 0 && (
              <Button
                variant="danger"
                size="sm"
                pending={pending}
                icon={<Trash2 className="size-4" />}
                onClick={() =>
                  void act(() => deleteCategoryAction(category.id), `${category.name} deleted.`)
                }
                title="Delete"
              >
                <span className="sr-only">Delete {category.name}</span>
              </Button>
            )}
          </div>
        </>
      )}
      {error && !renaming && <p className="text-[13px] text-negative">{error}</p>}
    </li>
  );
}
