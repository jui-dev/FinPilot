"use client";

import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import { createCommitmentAction, editCommitmentAction } from "@/app/_server/actions";
import { parseCalendarDate, type CalendarDate } from "@/domain/calendar-date";
import type { CommitmentFrequency } from "@/domain/commitments/schedule";
import type { Money as MoneyValue } from "@/domain/money";
import type { FieldErrors } from "@/server/commands";

import { longDate } from "../format";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Segmented } from "../ui/choice";
import { errorProps, Field, FormMessage, Input, Select } from "../ui/field";
import { formatTypedAmount, MoneyInput } from "../ui/money-input";
import { SidePanel } from "../ui/overlay";
import { useToast } from "../ui/toast";
import { describeRecurrence, isLeapDay, LEAP_DAY_NOTE } from "./describe";

export interface Choice {
  readonly id: string;
  readonly name: string;
}

/** A commitment as the edit form needs it. */
export interface EditableCommitment {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly expectedAmount: MoneyValue;
  readonly expectedAccountId: string | null;
  readonly frequency: CommitmentFrequency;
  readonly interval: number;
  readonly anchorOn: CalendarDate;
  readonly endOn: CalendarDate | null;
}

interface FormChoices {
  /** Expense categories a commitment may use. */
  readonly categories: readonly Choice[];
  /** Accounts that may be named as the usual one. */
  readonly accounts: readonly Choice[];
  readonly today: CalendarDate;
}

/** "New commitment": the page's own action, beside its title (and in the first empty state). */
export function NewCommitmentButton({
  emphasized = false,
  ...choices
}: FormChoices & { readonly emphasized?: boolean }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <Button
        variant={emphasized ? "primary" : "secondary"}
        icon={<Plus className="size-4" strokeWidth={2.25} />}
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        New commitment
      </Button>
      <CommitmentPanel key={session} open={open} onOpenChange={setOpen} {...choices} />
    </>
  );
}

/** A commitment's row, which opens its edit panel. The row's content is the trigger. */
export function EditCommitmentButton({
  commitment,
  className,
  describedBy,
  children,
  ...choices
}: FormChoices & {
  readonly commitment: EditableCommitment;
  readonly className?: string;
  /** Ids of the row details, announced after the button's "Edit <name>". */
  readonly describedBy?: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <button
        type="button"
        aria-label={`Edit ${commitment.name}`}
        aria-describedby={describedBy}
        className={className}
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        {children}
      </button>
      <CommitmentPanel
        key={session}
        open={open}
        onOpenChange={setOpen}
        commitment={commitment}
        {...choices}
      />
    </>
  );
}

/**
 * Creating or editing a commitment: what is owed, how often, from when, what
 * it is for, and where it is usually paid from. Nothing here records money —
 * an expense is recorded only when the person pays an occurrence.
 */
function CommitmentPanel({
  open,
  onOpenChange,
  commitment,
  categories,
  accounts,
  today,
}: FormChoices & {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly commitment?: EditableCommitment;
}) {
  const toast = useToast();
  const editing = commitment !== undefined;
  const [name, setName] = useState(commitment?.name ?? "");
  const [expectedAmount, setExpectedAmount] = useState(
    commitment ? formatTypedAmount(String(commitment.expectedAmount / 100)) : "",
  );
  const [frequency, setFrequency] = useState<CommitmentFrequency>(
    commitment?.frequency ?? "monthly",
  );
  const [interval, setEvery] = useState(String(commitment?.interval ?? 1));
  const [anchorOn, setAnchorOn] = useState<string>(commitment?.anchorOn ?? today);
  const [endOn, setEndOn] = useState<string>(commitment?.endOn ?? "");
  const [categoryId, setCategoryId] = useState(commitment?.categoryId ?? "");
  const [expectedAccountId, setExpectedAccountId] = useState(commitment?.expectedAccountId ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const anchor = parseCalendarDate(anchorOn);
  const every = Number(interval);
  const recurrence =
    anchor.ok && Number.isInteger(every) && every >= 1
      ? describeRecurrence({ frequency, interval: every, anchorOn: anchor.value })
      : null;
  const unit = frequency === "monthly" ? "months" : "years";

  const submit = async () => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const input = {
      name,
      categoryId,
      expectedAmount,
      expectedAccountId,
      frequency,
      interval,
      anchorOn,
      endOn,
    };
    const result = editing
      ? await editCommitmentAction(commitment.id, input)
      : await createCommitmentAction(input);
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setMessage(Object.keys(result.fieldErrors).length === 0 ? result.message : null);
      return;
    }
    toast({ message: editing ? `${name.trim()} saved.` : `${name.trim()} added.` });
    onOpenChange(false);
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${commitment.name}` : "New commitment"}
      description="A payment you owe on a schedule. It is recorded as an expense only when you pay it."
    >
      <form
        className="flex flex-col gap-4 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Name" htmlFor="commitment-name" error={errors.name}>
          <Input
            id="commitment-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Rent"
            maxLength={40}
            autoFocus
            {...errorProps("commitment-name", errors.name)}
          />
        </Field>

        <Field
          label="Expected amount"
          htmlFor="commitment-amount"
          error={errors.expectedAmount}
          hint="What you expect to pay each time. You can change it when you pay."
        >
          <MoneyInput
            id="commitment-amount"
            value={expectedAmount}
            onValueChange={setExpectedAmount}
            placeholder="0"
            {...errorProps("commitment-amount", errors.expectedAmount)}
          />
        </Field>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-meta font-medium text-ink-2">Repeats</span>
            <Segmented
              label="Repeats"
              size="sm"
              value={frequency}
              onChange={setFrequency}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]}
            />
          </div>
          <Field label={`Every how many ${unit}`} htmlFor="commitment-interval" className="w-44">
            <Input
              id="commitment-interval"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              controlSize="sm"
              value={interval}
              onChange={(event) => setEvery(event.target.value)}
              {...errorProps("commitment-interval", errors.interval)}
            />
          </Field>
        </div>
        {(errors.frequency || errors.interval) && (
          <p id="commitment-interval-error" className="-mt-2 text-meta text-negative">
            {errors.frequency ?? errors.interval}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="First due date"
            htmlFor="commitment-first"
            error={errors.anchorOn}
            hint={
              frequency === "monthly"
                ? "Later ones fall on the same day of the month, or its last day."
                : anchor.ok && isLeapDay(anchor.value)
                  ? `Later ones fall on the same date: ${LEAP_DAY_NOTE}.`
                  : "Later ones fall on the same date."
            }
          >
            <Input
              id="commitment-first"
              type="date"
              value={anchorOn}
              onChange={(event) => setAnchorOn(event.target.value)}
              {...errorProps("commitment-first", errors.anchorOn)}
            />
          </Field>
          <Field
            label="Last due date (optional)"
            htmlFor="commitment-end"
            error={errors.endOn}
            hint="Leave empty if it has no end."
          >
            <Input
              id="commitment-end"
              type="date"
              min={anchorOn || undefined}
              value={endOn}
              onChange={(event) => setEndOn(event.target.value)}
              {...errorProps("commitment-end", errors.endOn)}
            />
          </Field>
        </div>

        {recurrence && anchor.ok && (
          <div className="rounded-control bg-surface-hover px-3 py-2.5 text-meta text-ink-2">
            <p className="font-semibold text-ink">{recurrence}</p>
            <p className="mt-0.5">
              {editing
                ? "Schedule and amount changes apply to payments due after today. Anything already paid, skipped or past due keeps its date and amount."
                : anchor.value < today
                  ? `Due dates from ${longDate(anchor.value)} up to today will show as needing attention, so you can pay or skip each one.`
                  : `First due ${longDate(anchor.value)}.`}
            </p>
          </div>
        )}

        <Field
          label="Category"
          htmlFor="commitment-category"
          error={errors.categoryId}
          hint="When you pay, the expense is recorded in this category."
        >
          <Select
            id="commitment-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            {...errorProps("commitment-category", errors.categoryId)}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Usually paid from (optional)"
          htmlFor="commitment-account"
          error={errors.expectedAccountId}
          hint="Only pre-selects the account when you pay. Nothing is paid automatically."
        >
          <Select
            id="commitment-account"
            value={expectedAccountId}
            onChange={(event) => setExpectedAccountId(event.target.value)}
            {...errorProps("commitment-account", errors.expectedAccountId)}
          >
            <option value="">No usual account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <FormMessage>{message}</FormMessage>

        <div className={cn("flex justify-end gap-2 border-t border-line pt-4")}>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" pending={pending}>
            {editing ? "Save changes" : "Add commitment"}
          </Button>
        </div>
      </form>
    </SidePanel>
  );
}
