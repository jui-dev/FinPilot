"use client";

import { Trash2, Undo2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import {
  editEntryAction,
  editOpeningBalanceAction,
  refundExpenseAction,
  removeEntryAction,
  restoreEntryAction,
} from "@/app/_server/actions";
import type { CalendarDate } from "@/domain/calendar-date";
import { accountClass } from "@/domain/ledger/accounts";
import type { CategoryKind } from "@/domain/ledger/transactions";
import { negate, type Money } from "@/domain/money";
import type { FieldErrors } from "@/server/commands";
import type { ActivityItem, ActivityRow } from "@/server/services/activity-service";

import { longDate, shortDate } from "../format";
import { Button } from "../ui/button";
import { Segmented } from "../ui/choice";
import { errorProps, Field, FormMessage, Input, Select } from "../ui/field";
import { MoneyInput } from "../ui/money-input";
import { SidePanel } from "../ui/overlay";
import { Tag } from "../ui/panel";
import { useToast } from "../ui/toast";

type EditableType = "expense" | "income" | "transfer";

export interface PanelAccount {
  readonly id: string;
  readonly name: string;
  readonly type: import("@/domain/ledger/accounts").AccountType;
}

export interface PanelCategory {
  readonly id: string;
  readonly name: string;
  readonly kind: CategoryKind;
  /** Offered only because this transaction already uses it: kept, never newly chosen. */
  readonly archived?: boolean;
}

const takaText = (amount: Money): string => {
  const magnitude = amount < 0 ? negate(amount) : amount;
  const minor = magnitude % 100;
  return minor === 0 ? String(magnitude / 100) : (magnitude / 100).toFixed(2);
};

/**
 * Editing one ledger event without leaving the list: change anything, including
 * what kind of transaction it is (a one-row update in the ledger). Refund and
 * Delete live here too; Delete can be undone from the message that follows.
 */
export function TransactionPanel({
  item,
  accounts,
  categories,
  today,
}: {
  readonly item: ActivityItem | null;
  readonly accounts: readonly PanelAccount[];
  readonly categories: readonly PanelCategory[];
  readonly today: CalendarDate;
}) {
  // Keyed by the event, so opening another transaction starts from its own values.
  if (!item) return null;
  return (
    <EventPanel
      key={item.primary.id}
      item={item}
      accounts={accounts}
      categories={categories}
      today={today}
    />
  );
}

function EventPanel({
  item,
  accounts,
  categories,
  today,
}: {
  readonly item: ActivityItem;
  readonly accounts: readonly PanelAccount[];
  readonly categories: readonly PanelCategory[];
  readonly today: CalendarDate;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const rows: ActivityRow[] = [item.primary, ...(item.fee ? [item.fee] : [])];
  const [rowId, setRowId] = useState(item.primary.id);
  const [mode, setMode] = useState<"edit" | "refund">("edit");
  const row = rows.find((r) => r.id === rowId) ?? item.primary;

  const close = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("tx");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <SidePanel
      open
      onOpenChange={(next) => !next && close()}
      title={title(row)}
      description={`${longDate(row.occurredOn)} · ${row.account.name}`}
      header={
        rows.length > 1 ? (
          <div className="mt-3">
            <Segmented
              label="Part of this transfer"
              size="sm"
              value={row.id}
              onChange={(id) => {
                setRowId(id);
                setMode("edit");
              }}
              options={rows.map((r) => ({
                value: r.id,
                label: r.type === "transfer" ? "Transfer" : "Fee",
              }))}
            />
          </div>
        ) : null
      }
    >
      {row.type === "adjustment" ? (
        <p className="py-6 text-body text-ink-2">
          Balance adjustments come from reconciling an account and cannot be edited.
        </p>
      ) : row.type === "opening_balance" ? (
        <OpeningBalanceForm key={row.id} row={row} onDone={close} />
      ) : mode === "refund" ? (
        <RefundForm
          key={`${row.id}-refund`}
          row={row}
          accounts={accounts}
          today={today}
          onCancel={() => setMode("edit")}
          onDone={close}
        />
      ) : (
        <EditForm
          key={row.id}
          item={item}
          row={row}
          accounts={accounts}
          categories={categories}
          today={today}
          onRefund={() => setMode("refund")}
          onDone={close}
          onDeleted={(ids) =>
            toast({
              message: `Deleted ${title(row)}.`,
              action: {
                label: "Undo",
                onAction: async () => {
                  const restored = await restoreEntryAction(ids[0]);
                  toast({
                    message: restored.ok ? "Restored." : restored.message,
                    tone: restored.ok ? "default" : "error",
                  });
                },
              },
            })
          }
        />
      )}
    </SidePanel>
  );
}

const title = (row: ActivityRow): string =>
  row.description ||
  (row.type === "transfer"
    ? `Transfer to ${row.counterAccount?.name ?? "account"}`
    : row.type === "opening_balance"
      ? "Opening balance"
      : row.type === "adjustment"
        ? "Balance adjustment"
        : (row.category?.name ?? "Transaction"));

function EditForm({
  item,
  row,
  accounts,
  categories,
  today,
  onRefund,
  onDone,
  onDeleted,
}: {
  readonly item: ActivityItem;
  readonly row: ActivityRow;
  readonly accounts: readonly PanelAccount[];
  readonly categories: readonly PanelCategory[];
  readonly today: CalendarDate;
  readonly onRefund: () => void;
  readonly onDone: () => void;
  readonly onDeleted: (ids: string[]) => void;
}) {
  const toast = useToast();
  const isRefund = row.type === "refund";
  const [type, setType] = useState<EditableType>(
    row.type === "transfer" ? "transfer" : row.type === "income" ? "income" : "expense",
  );
  const [amount, setAmount] = useState(takaText(row.amount));
  const [accountId, setAccountId] = useState(row.account.id);
  const [counterAccountId, setCounterAccountId] = useState(
    row.counterAccount?.id ?? accounts.find((a) => a.id !== row.account.id)?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState(row.category?.id ?? "");
  const [occurredOn, setOccurredOn] = useState<string>(row.occurredOn);
  const [description, setDescription] = useState(row.description ?? "");
  const [note, setNote] = useState(row.note ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const kind: CategoryKind = type === "income" ? "income" : "expense";
  const inKind = categories.filter((c) => c.kind === kind || c.id === categoryId);

  const save = async () => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const input = isRefund
      ? {
          type: "refund",
          amount,
          accountId,
          categoryId,
          refundOfId: row.refundOfId ?? undefined,
          occurredOn,
          description,
          note,
        }
      : type === "transfer"
        ? { type, amount, accountId, counterAccountId, occurredOn, description, note }
        : { type, amount, accountId, categoryId, occurredOn, description, note };
    const result = await editEntryAction(row.id, input);
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setMessage(Object.keys(result.fieldErrors).length === 0 ? result.message : null);
      return;
    }
    toast({ message: "Changes saved." });
    onDone();
  };

  const remove = async () => {
    setDeleting(true);
    const result = await removeEntryAction(row.id);
    setDeleting(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    onDeleted(result.value);
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-4 pt-1"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {isRefund ? (
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="positive">Refund</Tag>
          {item.refundOf && (
            <span className="text-meta text-ink-2">
              of {item.refundOf.description ?? item.refundOf.category?.name ?? "an expense"} ·{" "}
              {shortDate(item.refundOf.occurredOn, today)}
            </span>
          )}
        </div>
      ) : (
        <Segmented
          label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
            { value: "transfer", label: "Transfer" },
          ]}
        />
      )}

      <Field label="Amount" htmlFor="edit-amount" error={errors.amount}>
        <MoneyInput
          id="edit-amount"
          value={amount}
          onValueChange={setAmount}
          {...errorProps("edit-amount", errors.amount)}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={type === "transfer" ? "From" : type === "income" ? "Received in" : "Paid from"}
          htmlFor="edit-account"
          error={errors.accountId}
        >
          <Select
            id="edit-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            {...errorProps("edit-account", errors.accountId)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        {type === "transfer" && !isRefund ? (
          <Field
            label={
              accountClass(accounts.find((a) => a.id === counterAccountId)?.type ?? "cash") ===
              "liability"
                ? "To · card payment"
                : "To"
            }
            htmlFor="edit-counter"
            error={errors.counterAccountId}
          >
            <Select
              id="edit-counter"
              value={counterAccountId}
              onChange={(e) => setCounterAccountId(e.target.value)}
              {...errorProps("edit-counter", errors.counterAccountId)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Category" htmlFor="edit-category" error={errors.categoryId}>
            <Select
              id="edit-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              {...errorProps("edit-category", errors.categoryId)}
            >
              {inKind.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.archived ? `${c.name} (archived)` : c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" htmlFor="edit-date" error={errors.occurredOn}>
          <Input
            id="edit-date"
            type="date"
            max={today}
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            {...errorProps("edit-date", errors.occurredOn)}
          />
        </Field>
        <Field label="Description" htmlFor="edit-description" error={errors.description}>
          <Input
            id="edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={120}
          />
        </Field>
      </div>

      <Field label="Note" htmlFor="edit-note" error={errors.note} hint="Optional.">
        <Input
          id="edit-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
      </Field>

      <FormMessage>{message}</FormMessage>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <div className="flex items-center gap-1">
          {row.type === "expense" && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Undo2 className="size-4" />}
              onClick={onRefund}
            >
              Refund
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="size-4" />}
            pending={deleting}
            onClick={() => void remove()}
          >
            Delete
          </Button>
        </div>
        <Button type="submit" variant="primary" pending={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function RefundForm({
  row,
  accounts,
  today,
  onCancel,
  onDone,
}: {
  readonly row: ActivityRow;
  readonly accounts: readonly PanelAccount[];
  readonly today: CalendarDate;
  readonly onCancel: () => void;
  readonly onDone: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(takaText(row.amount));
  const [accountId, setAccountId] = useState(row.account.id);
  const [occurredOn, setOccurredOn] = useState<string>(today);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const result = await refundExpenseAction(row.id, {
      amount,
      accountId,
      occurredOn,
      description: `Refund — ${row.description ?? row.category?.name ?? "expense"}`,
    });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setMessage(Object.keys(result.fieldErrors).length === 0 ? result.message : null);
      return;
    }
    toast({ message: "Refund recorded." });
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-4 pt-1"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-meta text-ink-2">
        A refund reduces spending in this expense&apos;s own category, so the category totals stay
        honest.
      </p>
      <Field label="Refund amount" htmlFor="refund-amount" error={errors.amount}>
        <MoneyInput
          id="refund-amount"
          value={amount}
          onValueChange={setAmount}
          {...errorProps("refund-amount", errors.amount)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Received in" htmlFor="refund-account" error={errors.accountId}>
          <Select
            id="refund-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            {...errorProps("refund-account", errors.accountId)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" htmlFor="refund-date" error={errors.occurredOn}>
          <Input
            id="refund-date"
            type="date"
            max={today}
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            {...errorProps("refund-date", errors.occurredOn)}
          />
        </Field>
      </div>
      <FormMessage>{message}</FormMessage>
      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          Record refund
        </Button>
      </div>
    </form>
  );
}

function OpeningBalanceForm({
  row,
  onDone,
}: {
  readonly row: ActivityRow;
  readonly onDone: () => void;
}) {
  const toast = useToast();
  const owed = accountClass(row.account.type) === "liability";
  const [amount, setAmount] = useState(takaText(row.amount));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const result = await editOpeningBalanceAction(row.id, { startingAmount: amount });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setMessage(Object.keys(result.fieldErrors).length === 0 ? result.message : null);
      return;
    }
    toast({ message: "Opening balance updated." });
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-4 pt-1"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-meta text-ink-2">
        Recorded when {row.account.name} was added, dated {longDate(row.occurredOn)}. Everything
        since then is built on top of it.
      </p>
      <Field
        label={owed ? "Owed at the start" : "Balance at the start"}
        htmlFor="opening-amount"
        error={errors.startingAmount}
      >
        <MoneyInput
          id="opening-amount"
          value={amount}
          onValueChange={setAmount}
          {...errorProps("opening-amount", errors.startingAmount)}
        />
      </Field>
      <FormMessage>{message}</FormMessage>
      <div className="flex justify-end border-t border-line pt-4">
        <Button type="submit" variant="primary" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
