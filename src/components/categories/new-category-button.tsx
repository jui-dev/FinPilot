"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { addCategoryAction } from "@/app/_server/actions";
import type { CategoryKind } from "@/domain/ledger/transactions";

import { Button } from "../ui/button";
import { errorProps, Field, Input } from "../ui/field";
import { Modal } from "../ui/overlay";
import { useToast } from "../ui/toast";
import { KIND_WORDS } from "./describe";

/** Adds a category of the kind on screen; a category's kind never changes afterwards. */
export function NewCategoryButton({ kind }: { readonly kind: CategoryKind }) {
  const toast = useToast();
  const words = KIND_WORDS[kind];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);
    const result = await addCategoryAction({ name, kind });
    setPending(false);
    if (!result.ok) {
      setError(result.fieldErrors.name ?? result.message);
      return;
    }
    setOpen(false);
    toast({ message: `${name.trim()} added to ${words.title}.` });
  };

  return (
    <>
      <Button
        variant="soft"
        size="sm"
        className="max-md:h-10"
        icon={<Plus className="size-4" strokeWidth={2.25} />}
        onClick={() => {
          setName("");
          setError(null);
          setOpen(true);
        }}
      >
        Add category
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`New ${words.one}`}
        description={`It will be offered for ${words.entries}.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="new-category"
              variant="primary"
              pending={pending}
              disabled={name.trim() === ""}
            >
              Add category
            </Button>
          </div>
        }
      >
        <form
          id="new-category"
          className="pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label="Name" htmlFor="new-category-name" error={error ?? undefined}>
            <Input
              id="new-category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "expense" ? "e.g. Pets" : "e.g. Freelance"}
              maxLength={40}
              autoFocus
              {...errorProps("new-category-name", error ?? undefined)}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
