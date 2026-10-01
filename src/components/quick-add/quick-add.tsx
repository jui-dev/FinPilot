"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { recordEntryAction, removeEntryAction } from "@/app/_server/actions";
import { addDays, type CalendarDate } from "@/domain/calendar-date";
import { accountClass, type AccountType } from "@/domain/ledger/accounts";
import type { CategoryKind } from "@/domain/ledger/transactions";
import { negate, type Money } from "@/domain/money";
import type { FieldErrors, RecordedTransaction } from "@/server/commands";
import type { EntryDefaults } from "@/server/services/activity-service";

import { shortDate } from "../format";
import { Button, linkClass } from "../ui/button";
import { Chip, Segmented } from "../ui/choice";
import { errorProps, Field, FormMessage, Input, Select } from "../ui/field";
import { Money as Amount } from "../ui/money";
import { MoneyInput } from "../ui/money-input";
import { Modal } from "../ui/overlay";
import { useToast } from "../ui/toast";

export interface QuickAddAccount {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly balance: Money;
}

export interface QuickAddCategory {
  readonly id: string;
  readonly name: string;
  readonly kind: CategoryKind;
}

export interface QuickAddData {
  readonly accounts: readonly QuickAddAccount[];
  readonly categories: readonly QuickAddCategory[];
  readonly defaults: EntryDefaults;
  readonly today: CalendarDate;
}

type EntryType = "expense" | "income" | "transfer";

const VISIBLE_CATEGORIES = 8;

export function QuickAdd({
  onClose,
  data,
}: {
  readonly onClose: () => void;
  readonly data: QuickAddData;
}) {
  const toast = useToast();
  const amountRef = useRef<HTMLInputElement>(null);
  const initial = defaultsFor(data, "expense");
  const [type, setType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(initial.accountId);
  const [counterAccountId, setCounterAccountId] = useState(initial.counterAccountId);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [occurredOn, setOccurredOn] = useState<string>(data.today);
  const [description, setDescription] = useState("");
  const [fee, setFee] = useState("");
  const [feeCategoryId, setFeeCategoryId] = useState(() => defaultFeeCategory(data));
  const [showFee, setShowFee] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const kind: CategoryKind = type === "income" ? "income" : "expense";
  const categories = useMemo(
    () => orderCategories(data, kind),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.categories, data.defaults, kind],
  );
  const accounts = data.accounts;
  /** Where a transfer fee can go: any active expense category, chosen explicitly. */
  const feeCategories = useMemo(
    () =>
      data.categories
        .filter((c) => c.kind === "expense")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.categories],
  );
  // Archived categories never reach Quick Add (the layout passes active ones only).
  const noCategory = type !== "transfer" && categories.length === 0;
  const yesterday = addDays(data.today, -1);

  /** Applies the remembered defaults for a type (on a type change, or after saving). */
  const reset = (nextType: EntryType, keepAmount = false) => {
    const next = defaultsFor(data, nextType);
    setType(nextType);
    if (!keepAmount) setAmount("");
    setDescription("");
    setErrors({});
    setMessage(null);
    setOccurredOn(data.today);
    setAccountId(next.accountId);
    setCounterAccountId(next.counterAccountId);
    setCategoryId(next.categoryId);
    setFee("");
    setFeeCategoryId(defaultFeeCategory(data));
    setShowFee(false);
  };

  const selected = accounts.find((a) => a.id === accountId);
  const counter = accounts.find((a) => a.id === counterAccountId);
  const cardPayment = counter !== undefined && accountClass(counter.type) === "liability";

  const submit = async (again: boolean) => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const input =
      type === "transfer"
        ? {
            type,
            amount,
            accountId,
            counterAccountId,
            occurredOn,
            description,
            ...(showFee && fee.trim() !== "" ? { fee, feeCategoryId } : {}),
          }
        : { type, amount, accountId, categoryId, occurredOn, description };
    const result = await recordEntryAction(input);
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setMessage(Object.keys(result.fieldErrors).length === 0 ? result.message : null);
      return;
    }
    toast({
      message: <SavedMessage type={type} result={result.value} />,
      action: {
        label: "Undo",
        onAction: async () => {
          const undone = await removeEntryAction(result.value.ids[0]);
          toast({
            message: undone.ok ? "Entry removed." : undone.message,
            tone: undone.ok ? "default" : "error",
          });
        },
      },
    });
    if (again) {
      reset(type, false);
      amountRef.current?.focus();
    } else {
      onClose();
    }
  };

  const visible = showAllCategories ? categories : categories.slice(0, VISIBLE_CATEGORIES);

  return (
    <Modal
      open
      onOpenChange={(next) => !next && onClose()}
      title="Add a transaction"
      hideTitle
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        amountRef.current?.focus();
      }}
      header={
        <Segmented
          label="Type"
          value={type}
          onChange={(next) => reset(next, true)}
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
            { value: "transfer", label: "Transfer" },
          ]}
        />
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-meta text-ink-2">
            <kbd className="font-medium">Enter</kbd> to save ·{" "}
            <kbd className="font-medium">Ctrl</kbd>+<kbd className="font-medium">Enter</kbd> to save
            &amp; add another
          </p>
          <Button
            variant="primary"
            pending={pending}
            disabled={noCategory}
            onClick={() => void submit(false)}
          >
            {type === "transfer"
              ? cardPayment
                ? "Save card payment"
                : "Save transfer"
              : `Save ${type}`}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void submit(true);
          }
        }}
      >
        <div>
          <MoneyInput
            ref={amountRef}
            size="lg"
            value={amount}
            onValueChange={setAmount}
            aria-label="Amount in taka"
            placeholder="0"
            {...errorProps("quick-amount", errors.amount)}
          />
          {errors.amount && (
            <p id="quick-amount-error" className="mt-1.5 text-meta text-negative">
              {errors.amount}
            </p>
          )}
        </div>

        {accounts.length === 0 && (
          // A fresh start (Settings → Clear all data) has no account to record against yet.
          <p className="rounded-control bg-surface-subtle px-3 py-2 text-meta text-ink-2">
            Nothing can be recorded until there is an account.{" "}
            <Link href="/accounts" className={linkClass} onClick={onClose}>
              Open one in Accounts
            </Link>
          </p>
        )}

        {type === "transfer" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From" htmlFor="quick-from" error={errors.accountId}>
                <Select
                  id="quick-from"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  {...errorProps("quick-from", errors.accountId)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={cardPayment ? "To · card payment" : "To"}
                htmlFor="quick-to"
                error={errors.counterAccountId}
              >
                <Select
                  id="quick-to"
                  value={counterAccountId}
                  onChange={(e) => setCounterAccountId(e.target.value)}
                  {...errorProps("quick-to", errors.counterAccountId)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {showFee ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Fee"
                  htmlFor="quick-fee"
                  error={errors.fee}
                  hint="Recorded as its own expense, linked to this transfer."
                >
                  <MoneyInput
                    id="quick-fee"
                    value={fee}
                    onValueChange={setFee}
                    placeholder="0"
                    {...errorProps("quick-fee", errors.fee)}
                  />
                </Field>
                <Field
                  label="Fee category"
                  htmlFor="quick-fee-category"
                  error={errors.feeCategoryId}
                >
                  <Select
                    id="quick-fee-category"
                    value={feeCategoryId}
                    onChange={(e) => setFeeCategoryId(e.target.value)}
                    {...errorProps("quick-fee-category", errors.feeCategoryId)}
                  >
                    {feeCategoryId === "" && <option value="">Choose a category</option>}
                    {feeCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              feeCategories.length > 0 && (
                <div>
                  <Button variant="ghost" size="sm" onClick={() => setShowFee(true)}>
                    + Add a fee
                  </Button>
                </div>
              )
            )}
          </>
        ) : (
          <>
            <div>
              <p className="mb-2 text-meta font-medium text-ink-2">Category</p>
              {noCategory && (
                // Categories are managed on their own page only; Quick Add just says why it cannot record.
                <p className="rounded-control bg-surface-subtle px-3 py-2 text-meta text-ink-2">
                  No active {type === "income" ? "Income" : "Expense"} Categories are available.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {visible.map((category) => (
                  <Chip
                    key={category.id}
                    selected={category.id === categoryId}
                    onClick={() => setCategoryId(category.id)}
                  >
                    {category.name}
                  </Chip>
                ))}
                {categories.length > VISIBLE_CATEGORIES && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllCategories((v) => !v)}
                    className="rounded-full"
                  >
                    {showAllCategories
                      ? "Show fewer"
                      : `+${categories.length - VISIBLE_CATEGORIES} more`}
                  </Button>
                )}
              </div>
              {errors.categoryId && (
                <p className="mt-1.5 text-meta text-negative">{errors.categoryId}</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-meta font-medium text-ink-2">
                {type === "income" ? "Received in" : "Paid from"}
              </p>
              <div className="flex flex-wrap gap-2">
                {accounts.map((account) => (
                  <Chip
                    key={account.id}
                    selected={account.id === accountId}
                    onClick={() => setAccountId(account.id)}
                  >
                    {account.name}
                  </Chip>
                ))}
              </div>
              {errors.accountId && (
                <p className="mt-1.5 text-meta text-negative">{errors.accountId}</p>
              )}
            </div>
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" htmlFor="quick-date" error={errors.occurredOn}>
            <div className="flex flex-wrap items-center gap-2">
              <Chip selected={occurredOn === data.today} onClick={() => setOccurredOn(data.today)}>
                Today
              </Chip>
              <Chip selected={occurredOn === yesterday} onClick={() => setOccurredOn(yesterday)}>
                Yesterday
              </Chip>
              <Input
                id="quick-date"
                type="date"
                max={data.today}
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
                controlSize="xs"
                className="w-[9.5rem]"
                {...errorProps("quick-date", errors.occurredOn)}
              />
            </div>
          </Field>
          <Field label="Description" htmlFor="quick-description" error={errors.description}>
            <Input
              id="quick-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === "transfer" ? "e.g. Cash-out" : "e.g. Lunch at Star Kabab"}
              maxLength={120}
            />
          </Field>
        </div>

        {selected && (
          <p className="text-meta text-ink-2">
            {selected.name} now{" "}
            {accountClass(selected.type) === "liability" ? (
              <>
                <Amount
                  amount={negate(selected.balance)}
                  sign="none"
                  className="font-medium text-ink"
                />{" "}
                owed
              </>
            ) : (
              <Amount amount={selected.balance} className="font-medium text-ink" />
            )}
            {type !== "transfer" && (
              <span className="text-ink-2">
                {" "}
                · {shortDate(occurredOn as CalendarDate, data.today)}
              </span>
            )}
          </p>
        )}

        <FormMessage>{message}</FormMessage>
        <button type="submit" className="sr-only" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

function SavedMessage({
  type,
  result,
}: {
  readonly type: EntryType;
  readonly result: RecordedTransaction;
}) {
  const first = result.effects[0];
  return (
    <span>
      Saved{" "}
      {first && (
        <>
          <span className="font-semibold">
            {first.name} <Amount amount={first.before} sign="none" /> →{" "}
            <Amount amount={first.after} sign="none" />
          </span>
          {type === "transfer" && result.effects[1] && (
            <>
              {" · "}
              <span className="font-semibold">
                {result.effects[1].name} <Amount amount={result.effects[1].after} sign="none" />
              </span>
            </>
          )}
        </>
      )}
    </span>
  );
}

/** Last used first, then most used recently, then the rest by name. */
function orderCategories(data: QuickAddData, kind: CategoryKind): readonly QuickAddCategory[] {
  const inKind = data.categories.filter((c) => c.kind === kind);
  const last =
    kind === "income" ? data.defaults.income?.categoryId : data.defaults.expense?.categoryId;
  const frequent = data.defaults.frequentCategoryIds[kind];
  const rank = (category: QuickAddCategory) => {
    if (category.id === last) return -1;
    const index = frequent.indexOf(category.id);
    return index === -1 ? frequent.length : index;
  };
  return [...inKind].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * The category a transfer fee starts in: the last fee's, while still active,
 * else an active "Fees & Charges". The name only suggests a starting choice —
 * any active expense category can take the fee, so renaming it changes nothing.
 */
export function defaultFeeCategory(data: QuickAddData): string {
  const expense = data.categories.filter((c) => c.kind === "expense");
  const last = data.defaults.feeCategoryId;
  if (last && expense.some((c) => c.id === last)) return last;
  return expense.find((c) => c.name.toLowerCase() === "fees & charges")?.id ?? "";
}

/** The account, counter account and category a new entry of this type starts with. */
function defaultsFor(data: QuickAddData, type: EntryType) {
  const remembered = data.defaults[type];
  const accountId = remembered?.accountId ?? data.accounts[0]?.id ?? "";
  if (type === "transfer") {
    const to = data.defaults.transfer?.counterAccountId ?? "";
    return {
      accountId,
      counterAccountId:
        to && to !== accountId ? to : (data.accounts.find((a) => a.id !== accountId)?.id ?? ""),
      categoryId: "",
    };
  }
  const list = orderCategories(data, type === "income" ? "income" : "expense");
  const last = data.defaults[type]?.categoryId ?? "";
  return {
    accountId,
    counterAccountId: "",
    categoryId: list.some((c) => c.id === last) ? last : (list[0]?.id ?? ""),
  };
}
