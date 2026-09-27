"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { verifyBalanceAction } from "@/app/_server/actions";
import type { CalendarDate } from "@/domain/calendar-date";
import { accountClass, type AccountType } from "@/domain/ledger/accounts";
import { formatMoney, negate, type Money as MoneyValue } from "@/domain/money";
import type { FieldErrors } from "@/server/commands";

import { Button } from "../ui/button";
import { errorProps, Field, FormMessage } from "../ui/field";
import { Money } from "../ui/money";
import { MoneyInput } from "../ui/money-input";
import { SidePanel } from "../ui/overlay";
import { useToast } from "../ui/toast";

/**
 * "What is actually there?" — the person counts the account, and the ledger is
 * corrected to agree as of today. When it already agrees, the verification is
 * still recorded and nothing is posted.
 *
 * The balance is verified as of today: the service accepts earlier dates, but
 * this boundary's UI does not ask for one.
 */
export function VerifyBalanceButton({
  id,
  name,
  type,
  balance,
  today,
}: {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly balance: MoneyValue;
  readonly today: CalendarDate;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [countedAmount, setCountedAmount] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const owed = accountClass(type) === "liability";
  // A liability's balance is negative when money is owed; the person states the
  // amount owed as a positive number, and the ledger re-applies the sign.
  const shown = owed ? (negate(balance) as MoneyValue) : balance;

  const submit = async () => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const result = await verifyBalanceAction({ accountId: id, asOf: today, countedAmount });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setMessage(Object.keys(result.fieldErrors).length === 0 ? result.message : null);
      return;
    }
    const { adjusted, difference } = result.value;
    toast({
      message: adjusted
        ? `${name} adjusted by ${formatMoney(difference)}.`
        : `${name} matches what you recorded.`,
    });
    setOpen(false);
    setCountedAmount("");
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<CheckCircle2 className="size-4" />}
        onClick={() => {
          setCountedAmount("");
          setErrors({});
          setMessage(null);
          setOpen(true);
        }}
        title={`Verify the balance of ${name}`}
      >
        Verify
      </Button>

      <SidePanel
        open={open}
        onOpenChange={setOpen}
        title={`Verify ${name}`}
        description="Count what is really there. If it differs from the ledger, the difference is recorded as an adjustment dated today."
      >
        <form
          className="flex flex-col gap-4 pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-baseline justify-between gap-3 rounded-control bg-surface-hover px-3 py-2.5">
            <span className="text-meta text-ink-2">{owed ? "Recorded as owed" : "Recorded"}</span>
            <span className="text-body font-semibold">
              <Money amount={shown} sign={owed ? "none" : "negative"} />
            </span>
          </div>

          <Field
            label={owed ? "How much do you actually owe?" : "How much is actually there?"}
            htmlFor="verify-counted"
            error={errors.countedAmount}
            hint="Enter zero if it is empty."
          >
            <MoneyInput
              id="verify-counted"
              value={countedAmount}
              onValueChange={setCountedAmount}
              placeholder="0"
              autoFocus
              {...errorProps("verify-counted", errors.countedAmount)}
            />
          </Field>

          <FormMessage>{message}</FormMessage>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" pending={pending}>
              Verify balance
            </Button>
          </div>
        </form>
      </SidePanel>
    </>
  );
}
