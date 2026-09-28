"use client";

import { HandCoins, SkipForward } from "lucide-react";
import { useState } from "react";

import {
  payOccurrenceAction,
  removeEntryAction,
  skipOccurrenceAction,
} from "@/app/_server/actions";
import type { CalendarDate } from "@/domain/calendar-date";
import { formatMoney, parseMoney, type Money as MoneyValue } from "@/domain/money";
import type { FieldErrors } from "@/server/commands";

import { longDate, shortDate } from "../format";
import { Button } from "../ui/button";
import { errorProps, Field, FormMessage, Input, Select } from "../ui/field";
import { Money } from "../ui/money";
import { formatTypedAmount, MoneyInput } from "../ui/money-input";
import { Modal, SidePanel } from "../ui/overlay";
import { useToast } from "../ui/toast";
import type { Choice } from "./commitment-panel";

/** Row actions keep a 40px touch height on phones; 32px from md up (as on Accounts). */
const ROW_ACTION = "max-md:h-10";

export interface PayableOccurrence {
  readonly id: string;
  readonly name: string;
  readonly dueOn: CalendarDate;
  readonly expectedAmount: MoneyValue;
  readonly expectedAccountId: string | null;
  readonly categoryName: string;
}

/**
 * Pay and Skip: the two explicit ways an occurrence is settled. A due date
 * never records anything by itself. Needs-attention rows emphasise Pay; each
 * button names its occurrence for screen readers, since every row repeats them.
 */
export function OccurrenceActions({
  occurrence,
  accounts,
  today,
  emphasized,
}: {
  readonly occurrence: PayableOccurrence;
  /** Accounts a payment can be recorded on (active ones). */
  readonly accounts: readonly Choice[];
  readonly today: CalendarDate;
  readonly emphasized: boolean;
}) {
  const [paying, setPaying] = useState(false);
  const [paySession, setPaySession] = useState(0);
  const [skipping, setSkipping] = useState(false);
  const due = shortDate(occurrence.dueOn, today);
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant={emphasized ? "secondary" : "ghost"}
        size="sm"
        className={ROW_ACTION}
        icon={<HandCoins className="size-4" />}
        onClick={() => {
          setPaySession((n) => n + 1);
          setPaying(true);
        }}
      >
        Pay
        <span className="sr-only">
          {" "}
          {occurrence.name}, due {due}
        </span>
      </Button>
      {/* Needs attention labels Skip; further ahead it is a quiet icon, so a long
          list is not a column of repeated words. Its name is the same either way. */}
      <Button
        variant="ghost"
        size={emphasized ? "sm" : "icon"}
        className={emphasized ? ROW_ACTION : "max-md:size-10"}
        icon={<SkipForward className="size-4" />}
        onClick={() => setSkipping(true)}
        title={emphasized ? undefined : `Skip ${occurrence.name}, due ${due}`}
      >
        <span className={emphasized ? undefined : "sr-only"}>Skip</span>
        <span className="sr-only">
          {" "}
          {occurrence.name}, due {due}
        </span>
      </Button>

      <PayPanel
        key={paySession}
        open={paying}
        onOpenChange={setPaying}
        occurrence={occurrence}
        accounts={accounts}
        today={today}
      />
      <SkipDialog
        open={skipping}
        onOpenChange={setSkipping}
        occurrence={occurrence}
        today={today}
      />
    </div>
  );
}

/**
 * "Record this payment." Makes plain that a real expense is recorded, with
 * the amount, account and date the person confirms; the category and
 * description come from the commitment.
 */
function PayPanel({
  open,
  onOpenChange,
  occurrence,
  accounts,
  today,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly occurrence: PayableOccurrence;
  readonly accounts: readonly Choice[];
  readonly today: CalendarDate;
}) {
  const toast = useToast();
  const usual = accounts.some((a) => a.id === occurrence.expectedAccountId)
    ? occurrence.expectedAccountId!
    : "";
  const [amount, setAmount] = useState(formatTypedAmount(String(occurrence.expectedAmount / 100)));
  const [accountId, setAccountId] = useState(usual);
  const [occurredOn, setOccurredOn] = useState<string>(today);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const result = await payOccurrenceAction(occurrence.id, { accountId, amount, occurredOn });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      // A rule about something not on this form (e.g. an archived category) is form-level.
      const shown = ["amount", "accountId", "occurredOn"].some((f) => result.fieldErrors[f]);
      setMessage(shown ? null : result.message);
      return;
    }
    const transactionId = result.value;
    const account = accounts.find((a) => a.id === accountId)?.name ?? "";
    toast({
      message: `Paid ${occurrence.name} · ${formatMoney(amountOf(amount, occurrence.expectedAmount))} from ${account}.`,
      action: {
        label: "Undo",
        onAction: async () => {
          const removed = await removeEntryAction(transactionId);
          toast({
            message: removed.ok
              ? `Payment removed. ${occurrence.name} is due again.`
              : removed.message,
            tone: removed.ok ? "default" : "error",
          });
        },
      },
    });
    onOpenChange(false);
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={`Pay ${occurrence.name}`}
      description="Records a real expense in your ledger, so your balances and cash flow include it."
    >
      <form
        className="flex flex-col gap-4 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <dl className="grid grid-cols-2 gap-3 rounded-control bg-surface-hover px-3 py-2.5 text-meta">
          <div>
            <dt className="text-ink-2">Due</dt>
            <dd className="font-semibold text-ink">{longDate(occurrence.dueOn)}</dd>
          </div>
          <div className="text-right">
            <dt className="text-ink-2">Expected</dt>
            <dd className="font-semibold text-ink">
              <Money amount={occurrence.expectedAmount} />
            </dd>
          </div>
        </dl>

        <Field
          label="Amount paid"
          htmlFor="pay-amount"
          error={errors.amount}
          hint="Change it if this time's bill was different."
        >
          <MoneyInput
            id="pay-amount"
            value={amount}
            onValueChange={setAmount}
            autoFocus
            {...errorProps("pay-amount", errors.amount)}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paid from" htmlFor="pay-account" error={errors.accountId}>
            <Select
              id="pay-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              {...errorProps("pay-account", errors.accountId)}
            >
              <option value="" disabled>
                Choose an account
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paid on" htmlFor="pay-date" error={errors.occurredOn}>
            <Input
              id="pay-date"
              type="date"
              max={today}
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
              {...errorProps("pay-date", errors.occurredOn)}
            />
          </Field>
        </div>

        <p className="text-meta text-ink-2">
          Recorded as an expense in{" "}
          <span className="font-semibold text-ink">{occurrence.categoryName}</span>, described as “
          {occurrence.name}”.
        </p>

        <FormMessage>{message}</FormMessage>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" pending={pending}>
            Record payment
          </Button>
        </div>
      </form>
    </SidePanel>
  );
}

/** The amount the toast reports, parsed by the same domain parser the server uses. */
function amountOf(typed: string, expected: MoneyValue): MoneyValue {
  const parsed = parseMoney(typed);
  return parsed.ok ? parsed.value : expected;
}

/**
 * Skipping is a decision, not a deletion: the occurrence stays on record as
 * skipped, no expense is recorded, and it no longer needs attention.
 */
function SkipDialog({
  open,
  onOpenChange,
  occurrence,
  today,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly occurrence: PayableOccurrence;
  readonly today: CalendarDate;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const due = shortDate(occurrence.dueOn, today);

  const skip = async () => {
    setPending(true);
    const result = await skipOccurrenceAction(occurrence.id);
    setPending(false);
    onOpenChange(false);
    toast({
      message: result.ok ? `${occurrence.name} (${due}) skipped.` : result.message,
      tone: result.ok ? "default" : "error",
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Skip ${occurrence.name} due ${due}?`}
      description="It will be marked as skipped. No expense is recorded, and it will no longer count as due."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" pending={pending} onClick={() => void skip()}>
            Skip this payment
          </Button>
        </div>
      }
    >
      <span className="sr-only">
        Confirm skipping {occurrence.name}, due {due}
      </span>
    </Modal>
  );
}
