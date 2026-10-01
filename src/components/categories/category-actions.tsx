"use client";

import { Archive, ArchiveRestore, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  archiveCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
  restoreCategoryAction,
} from "@/app/_server/actions";
import { LAST_ACTIVE_CATEGORY_MESSAGE } from "@/domain/ledger/categories";

import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { errorProps, Field, Input } from "../ui/field";
import { Modal } from "../ui/overlay";
import { useToast } from "../ui/toast";
import { archiveNotice, isUsed, KIND_WORDS, renameNotice, type CategoryView } from "./describe";

type Step = "menu" | "rename" | "archive" | "delete" | "last";

/** A row action's touch height on phones and tablets, as in Accounts. */
const ROW_ACTION = "max-md:h-10";

/** The row's action slots, left to right. */
const SLOTS: ReadonlyArray<readonly string[]> = [["rename"], ["archive", "restore"], ["delete"]];

/**
 * Managing one category: only what the ledger allows is offered. Rename is
 * always there; renaming a used category says what it changes first. Archive
 * asks first only when something uses the category (an unused one archives
 * with Undo); the kind's last active category explains why it stays. Delete
 * appears only when nothing ever used the category, and always confirms.
 *
 * From 640px the actions are words on the row. On phones one Manage button
 * opens a sheet of them, and each step (rename, a confirmation) replaces the
 * list in that same sheet, so focus returns to Manage when it closes. Each
 * button names its category for screen readers, since every row repeats them.
 */
export function CategoryActions({ view }: { readonly view: CategoryView }) {
  const toast = useToast();
  const [step, setStep] = useState<Step | null>(null);
  const [name, setName] = useState(view.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const words = KIND_WORDS[view.kind];

  const close = () => setStep(null);

  const startRename = () => {
    setName(view.name);
    setError(null);
    setStep("rename");
  };

  const rename = async () => {
    setPending(true);
    setError(null);
    const result = await renameCategoryAction(view.id, name);
    setPending(false);
    if (!result.ok) {
      setError(result.fieldErrors.name ?? result.message);
      return;
    }
    close();
    toast({ message: `Renamed to ${name.trim()}.` });
  };

  const restore = async () => {
    setPending(true);
    const result = await restoreCategoryAction(view.id);
    setPending(false);
    close();
    toast({
      message: result.ok
        ? `${view.name} restored. It's offered for ${words.entries} again.`
        : result.message,
      tone: result.ok ? "default" : "error",
    });
  };

  const archive = async () => {
    setPending(true);
    const result = await archiveCategoryAction(view.id);
    setPending(false);
    close();
    toast({
      message: result.ok ? `${view.name} archived.` : result.message,
      tone: result.ok ? "default" : "error",
      ...(result.ok
        ? {
            action: {
              label: "Undo",
              onAction: async () => {
                const restored = await restoreCategoryAction(view.id);
                toast({
                  message: restored.ok ? `${view.name} restored.` : restored.message,
                  tone: restored.ok ? "default" : "error",
                });
              },
            },
          }
        : {}),
    });
  };

  /** Archive, asking first only when it matters. */
  const startArchive = () => {
    if (view.lastActive) setStep("last");
    else if (isUsed(view)) setStep("archive");
    else void archive();
  };

  const remove = async () => {
    setPending(true);
    const result = await deleteCategoryAction(view.id);
    setPending(false);
    close();
    toast({
      message: result.ok ? `${view.name} deleted.` : result.message,
      tone: result.ok ? "default" : "error",
    });
  };

  const actions: ReadonlyArray<{
    key: string;
    label: string;
    icon: ReactNode;
    danger?: boolean;
    run: () => void;
  }> = [
    ...(view.archived
      ? [
          {
            key: "restore",
            label: "Restore",
            icon: <ArchiveRestore className="size-4" />,
            run: () => void restore(),
          },
        ]
      : [
          {
            key: "rename",
            label: "Rename",
            icon: <Pencil className="size-4" />,
            run: startRename,
          },
          {
            key: "archive",
            label: "Archive",
            icon: <Archive className="size-4" />,
            run: startArchive,
          },
        ]),
    ...(view.deletable
      ? [
          {
            key: "delete",
            label: "Delete",
            icon: <Trash2 className="size-4" />,
            danger: true,
            run: () => setStep("delete"),
          },
        ]
      : []),
  ];

  const cancel = (
    <Button variant="ghost" onClick={close}>
      Cancel
    </Button>
  );

  const dialog: Record<
    Step,
    { title: string; description?: ReactNode; body?: ReactNode; footer?: ReactNode }
  > = {
    menu: {
      title: view.name,
      description: view.archived ? `Archived ${words.one}` : words.one,
      body: (
        <ul className="flex flex-col gap-2 pt-1">
          {actions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                disabled={pending}
                onClick={action.run}
                className={cn(
                  "flex h-12 w-full items-center gap-3 rounded-control px-4 text-body font-semibold transition-colors disabled:opacity-45",
                  "focus-visible:outline-2 focus-visible:outline-ocean",
                  action.danger
                    ? "text-negative hover:bg-negative-soft"
                    : "bg-surface-subtle text-ink hover:bg-surface-hover",
                )}
              >
                {action.icon}
                {action.label}
                <span className="sr-only"> {view.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ),
    },
    rename: {
      title: `Rename ${view.name}`,
      body: (
        <form
          id={`rename-${view.id}`}
          className="flex flex-col gap-4 pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            void rename();
          }}
        >
          <Field label="Name" htmlFor={`category-name-${view.id}`} error={error ?? undefined}>
            <Input
              id={`category-name-${view.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              autoFocus
              {...errorProps(`category-name-${view.id}`, error ?? undefined)}
            />
          </Field>
          {isUsed(view) && (
            <p className="rounded-control bg-mist/40 px-3.5 py-3 text-body text-ink shadow-[inset_0_0_0_1px_rgb(70_103_141/0.14)]">
              {renameNotice(view)}
            </p>
          )}
        </form>
      ),
      footer: (
        <div className="flex justify-end gap-2">
          {cancel}
          <Button
            type="submit"
            form={`rename-${view.id}`}
            variant="primary"
            pending={pending}
            disabled={name.trim() === "" || name.trim() === view.name}
          >
            Rename category
          </Button>
        </div>
      ),
    },
    archive: {
      title: `Archive ${view.name}?`,
      body: <p className="text-body text-ink-2">{archiveNotice(view)}</p>,
      footer: (
        <div className="flex justify-end gap-2">
          {cancel}
          <Button variant="primary" pending={pending} onClick={() => void archive()}>
            Archive category
          </Button>
        </div>
      ),
    },
    delete: {
      title: `Delete ${view.name}?`,
      body: (
        <p className="text-body text-ink-2">
          Nothing has been recorded in it, so nothing is lost. This can&apos;t be undone.
        </p>
      ),
      footer: (
        <div className="flex justify-end gap-2">
          {cancel}
          <Button variant="destructive" pending={pending} onClick={() => void remove()}>
            Delete category
          </Button>
        </div>
      ),
    },
    last: {
      title: `${view.name} stays active`,
      body: <p className="text-body text-ink-2">{LAST_ACTIVE_CATEGORY_MESSAGE[view.kind]}</p>,
      footer: (
        <div className="flex justify-end">
          <Button variant="primary" onClick={close}>
            OK
          </Button>
        </div>
      ),
    },
  };

  const current = step ? dialog[step] : null;

  return (
    <>
      {/* From 640px: the actions themselves, as words, each in its own slot
          (Rename · Archive or Restore · Delete), so they line up down the list
          whichever a row offers. */}
      <div className="hidden grid-cols-[6.5rem_6.75rem_6.25rem] items-center sm:grid">
        {SLOTS.map((keys) => {
          const action = actions.find((a) => keys.includes(a.key));
          return action ? (
            <Button
              key={action.key}
              variant={action.danger ? "danger" : "ghost"}
              size="sm"
              className={cn(ROW_ACTION, "justify-self-start")}
              icon={action.icon}
              pending={pending && action.key === "restore"}
              onClick={action.run}
            >
              {action.label}
              <span className="sr-only"> {view.name}</span>
            </Button>
          ) : (
            <span key={keys.join()} aria-hidden />
          );
        })}
      </div>

      {/* Phones: one button, its actions in a sheet. */}
      <button
        type="button"
        onClick={() => setStep("menu")}
        className="grid size-10 place-items-center rounded-control text-ink-2 transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-ocean sm:hidden"
      >
        <Ellipsis aria-hidden className="size-5" strokeWidth={1.75} />
        <span className="sr-only">Manage {view.name}</span>
      </button>

      <Modal
        open={current !== null}
        onOpenChange={(open) => !open && close()}
        title={current?.title ?? view.name}
        description={current?.description}
        footer={current?.footer}
      >
        {current?.body}
      </Modal>
    </>
  );
}
