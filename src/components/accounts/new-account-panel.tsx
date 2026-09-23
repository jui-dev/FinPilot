"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { openAccountAction } from "@/app/_server/actions";
import type { CalendarDate } from "@/domain/calendar-date";
import { accountClass, ACCOUNT_TYPES, type AccountType } from "@/domain/ledger/accounts";
import type { FieldErrors } from "@/server/commands";

import { ACCOUNT_TYPE_LABEL } from "../ledger/icons";
import { Button } from "../ui/button";
import { Segmented } from "../ui/choice";
import { errorProps, Field, FormMessage, Input } from "../ui/field";
import { MoneyInput } from "../ui/money-input";
import { SidePanel } from "../ui/overlay";
import { useToast } from "../ui/toast";

/** Adds an account and, when it starts with money (or debt), its opening balance. */
export function NewAccountButton({ today }: { readonly today: CalendarDate }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [openedOn, setOpenedOn] = useState<string>(today);
  const [startingAmount, setStartingAmount] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const owed = accountClass(type) === "liability";

  const reset = () => {
    setName("");
    setType("bank");
    setOpenedOn(today);
    setStartingAmount("");
    setErrors({});
    setMessage(null);
  };

  const submit = async () => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const result = await openAccountAction({ name, type, openedOn, startingAmount });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setMessage(Object.keys(result.fieldErrors).length === 0 ? result.message : null);
      return;
    }
    toast({ message: `${name.trim()} added.` });
    setOpen(false);
    reset();
  };

  return (
    <>
      <Button
        variant="secondary"
        icon={<Plus className="size-4" strokeWidth={2.25} />}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        New account
      </Button>

      <SidePanel
        open={open}
        onOpenChange={setOpen}
        title="New account"
        description="Balances are derived from what you record, starting with this amount."
      >
        <form
          className="flex flex-col gap-4 pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label="Name" htmlFor="account-name" error={errors.name}>
            <Input
              id="account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. City Bank"
              maxLength={40}
              autoFocus
              {...errorProps("account-name", errors.name)}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">Type</span>
            <Segmented
              label="Account type"
              size="sm"
              className="flex-wrap"
              value={type}
              onChange={setType}
              options={ACCOUNT_TYPES.map((value) => ({
                value,
                label: ACCOUNT_TYPE_LABEL[value],
              }))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Opened on" htmlFor="account-opened" error={errors.openedOn}>
              <Input
                id="account-opened"
                type="date"
                max={today}
                value={openedOn}
                onChange={(event) => setOpenedOn(event.target.value)}
                {...errorProps("account-opened", errors.openedOn)}
              />
            </Field>
            <Field
              label={owed ? "Owed on that date" : "Balance on that date"}
              htmlFor="account-start"
              error={errors.startingAmount}
              hint="Leave empty if it started at zero."
            >
              <MoneyInput
                id="account-start"
                value={startingAmount}
                onValueChange={setStartingAmount}
                placeholder="0"
                {...errorProps("account-start", errors.startingAmount)}
              />
            </Field>
          </div>

          <FormMessage>{message}</FormMessage>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" pending={pending}>
              Add account
            </Button>
          </div>
        </form>
      </SidePanel>
    </>
  );
}
