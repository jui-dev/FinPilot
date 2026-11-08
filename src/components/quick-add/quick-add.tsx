"use client";

import { ArrowUpDown, ChevronLeft, ChevronRight, Plus, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";

import { recordEntryAction, removeEntryAction } from "@/app/_server/actions";
import { addDays, type CalendarDate } from "@/domain/calendar-date";
import { accountClass, type AccountType } from "@/domain/ledger/accounts";
import { liabilityStanding } from "@/domain/ledger/position";
import type { CategoryKind } from "@/domain/ledger/transactions";
import type { Money } from "@/domain/money";
import type { FieldErrors, RecordedTransaction } from "@/server/commands";
import type { EntryDefaults } from "@/server/services/activity-service";

import { KIND_STYLE } from "../categories/kind-style";
import {
  ACCOUNT_TYPE_LABEL,
  accountIcon,
  categoryIcon,
  Glyph,
  TRANSFER_MARK,
  TransferIcon,
  type GlyphTone,
} from "../ledger/icons";
import { Button, linkClass } from "../ui/button";
import { Segmented } from "../ui/choice";
import { cn } from "../ui/cn";
import { errorProps, FormMessage, Input } from "../ui/field";
import { Money as Amount } from "../ui/money";
import { MoneyInput } from "../ui/money-input";
import { Modal } from "../ui/overlay";
import { Tag } from "../ui/panel";
import { useToast } from "../ui/toast";
import { ChoiceList, type Choice, type ChoiceSection } from "./choice-list";
import { previewEffects, type AccountEffect, type EntryType } from "./preview";

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

/** How many recently used categories the category list puts first. */
const RECENT_CATEGORIES = 3;

/**
 * Each type's mark: its direction and a tint from the families the palette
 * already gives money leaving (warm) and arriving (mist), as the Categories
 * page draws them; a transfer, money staying yours, in ocean. The words and the
 * arrow carry the type; the tint only repeats it.
 */
const TYPES: Record<
  EntryType,
  { readonly label: string; readonly icon: LucideIcon; readonly mark: string }
> = {
  expense: { label: "Expense", icon: KIND_STYLE.expense.icon, mark: KIND_STYLE.expense.mark },
  income: { label: "Income", icon: KIND_STYLE.income.icon, mark: KIND_STYLE.income.mark },
  transfer: {
    label: "Transfer",
    icon: TransferIcon,
    mark: TRANSFER_MARK,
  },
};

/** A choice being made in the list that stands in for the form. */
type Picking = "category" | "account" | "counter" | "feeCategory";

type DateChoice = "today" | "yesterday" | "earlier";

export function QuickAdd({
  onClose,
  data,
}: {
  readonly onClose: () => void;
  readonly data: QuickAddData;
}) {
  const toast = useToast();
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Partial<Record<Picking, HTMLButtonElement | null>>>({});
  const returnTo = useRef<Picking | null>(null);
  const datePointer = useRef(false);

  const initial = defaultsFor(data, "expense");
  const [type, setType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(initial.accountId);
  const [counterAccountId, setCounterAccountId] = useState(initial.counterAccountId);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [occurredOn, setOccurredOn] = useState<CalendarDate>(data.today);
  const [earlier, setEarlier] = useState(false);
  const [description, setDescription] = useState("");
  const [describing, setDescribing] = useState(false);
  const [fee, setFee] = useState("");
  const [feeCategoryId, setFeeCategoryId] = useState(() => defaultFeeCategory(data));
  const [showFee, setShowFee] = useState(false);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const kind: CategoryKind = type === "income" ? "income" : "expense";
  const accounts = data.accounts;
  const categories = useMemo(
    () => data.categories.filter((c) => c.kind === kind),
    [data.categories, kind],
  );
  /** Where a transfer fee can go: any active expense category, chosen explicitly. */
  const feeCategories = useMemo(
    () => byName(data.categories.filter((c) => c.kind === "expense")),
    [data.categories],
  );
  // Archived categories never reach Quick Add (the layout passes active ones only).
  const noCategory = type !== "transfer" && categories.length === 0;
  const yesterday = addDays(data.today, -1);
  const dateChoice: DateChoice =
    !earlier && occurredOn === data.today
      ? "today"
      : !earlier && occurredOn === yesterday
        ? "yesterday"
        : "earlier";

  const account = accounts.find((a) => a.id === accountId);
  const counter = accounts.find((a) => a.id === counterAccountId);
  const category = data.categories.find((c) => c.id === categoryId);
  const feeCategory = data.categories.find((c) => c.id === feeCategoryId);
  const cardPayment = counter !== undefined && accountClass(counter.type) === "liability";

  const effects = previewEffects(
    {
      type,
      amount,
      accountId,
      counterAccountId,
      categoryId,
      occurredOn,
      fee: type === "transfer" && showFee ? fee : null,
      feeCategoryId,
    },
    accounts,
  );

  // Back from a list, focus returns to the row that opened it.
  useEffect(() => {
    if (picking !== null || returnTo.current === null) return;
    rowRefs.current[returnTo.current]?.focus();
    returnTo.current = null;
  }, [picking]);

  const pick = (what: Picking) => {
    returnTo.current = what;
    setPicking(what);
  };

  /** Applies the remembered defaults for a type (on a type change, or after saving). */
  const reset = (nextType: EntryType, keepAmount = false) => {
    const next = defaultsFor(data, nextType);
    setType(nextType);
    if (!keepAmount) setAmount("");
    setDescription("");
    setDescribing(false);
    setErrors({});
    setMessage(null);
    setOccurredOn(data.today);
    setEarlier(false);
    setAccountId(next.accountId);
    setCounterAccountId(next.counterAccountId);
    setCategoryId(next.categoryId);
    setFee("");
    setFeeCategoryId(defaultFeeCategory(data));
    setShowFee(false);
    setPicking(null);
  };

  const chooseDate = (choice: DateChoice) => {
    const fromPointer = datePointer.current;
    datePointer.current = false;
    if (choice === "earlier") {
      setEarlier(true);
      // Earlier means before yesterday: start there rather than showing today under "Earlier".
      if (occurredOn === data.today || occurredOn === yesterday)
        setOccurredOn(addDays(data.today, -2));
      // A click or tap on Earlier goes straight to the date; arrow keys stay in the switch.
      if (fromPointer) {
        requestAnimationFrame(() => {
          dateRef.current?.focus();
          try {
            dateRef.current?.showPicker();
          } catch {
            // Not every browser opens a date picker on request; the field is focused regardless.
          }
        });
      }
      return;
    }
    setEarlier(false);
    setOccurredOn(choice === "today" ? data.today : yesterday);
  };

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
      if (result.fieldErrors.description) setDescribing(true);
      if (result.fieldErrors.occurredOn && dateChoice === "earlier") setEarlier(true);
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

  const accountChoices: Choice[] = accounts.map((a) => ({
    id: a.id,
    label: a.name,
    icon: accountIcon(a.type),
    // "Cash · Cash" says nothing twice.
    ...(ACCOUNT_TYPE_LABEL[a.type] !== a.name ? { detail: ACCOUNT_TYPE_LABEL[a.type] } : {}),
    aside: <Balance type={a.type} amount={a.balance} />,
  }));
  const categoryChoice =
    (tone: GlyphTone) =>
    (c: QuickAddCategory): Choice => ({
      id: c.id,
      label: c.name,
      icon: categoryIcon(c.name),
      tone,
    });

  const list = (): {
    title: string;
    search: string;
    noun: string;
    sections: ChoiceSection[];
    selected: string;
    choose: (id: string) => void;
  } => {
    switch (picking) {
      case "category": {
        const recent = recentCategories(data, kind);
        const rest = byName(categories.filter((c) => !recent.includes(c)));
        const toChoice = categoryChoice(KIND_STYLE[kind].glyph);
        return {
          title: "Choose a category",
          search: `Search ${kind} categories`,
          noun: "category",
          sections: [
            { title: "Recent", choices: recent.map(toChoice) },
            {
              title:
                recent.length > 0 ? `Other ${kind} categories` : `${KIND_TITLE[kind]} categories`,
              choices: rest.map(toChoice),
            },
          ],
          selected: categoryId,
          choose: setCategoryId,
        };
      }
      case "feeCategory":
        return {
          title: "Fee category",
          search: "Search expense categories",
          noun: "category",
          sections: [{ choices: feeCategories.map(categoryChoice(KIND_STYLE.expense.glyph)) }],
          selected: feeCategoryId,
          choose: setFeeCategoryId,
        };
      case "counter":
        return {
          title: "To",
          search: "Search accounts",
          noun: "account",
          sections: [{ choices: accountChoices }],
          selected: counterAccountId,
          choose: setCounterAccountId,
        };
      default:
        return {
          title: accountLabel(type),
          search: "Search accounts",
          noun: "account",
          sections: [{ choices: accountChoices }],
          selected: accountId,
          choose: setAccountId,
        };
    }
  };
  const open = picking ? list() : null;

  const saveLabel =
    type === "transfer" ? (cardPayment ? "Save card payment" : "Save transfer") : `Save ${type}`;

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
      // Escape in a list steps back to the form; on the form it closes Quick Add.
      onEscapeKeyDown={(event) => {
        if (picking === null) return;
        event.preventDefault();
        setPicking(null);
      }}
      header={
        open ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to the entry"
              onClick={() => setPicking(null)}
            >
              <ChevronLeft aria-hidden className="size-4.5" strokeWidth={1.75} />
            </Button>
            <h3 className="text-heading font-semibold">{open.title}</h3>
          </div>
        ) : (
          <Segmented
            label="Type"
            appearance="raised"
            className="w-full"
            value={type}
            onChange={(next) => reset(next, true)}
            options={(Object.keys(TYPES) as EntryType[]).map((value) => ({
              value,
              label: <TypeLabel type={value} selected={value === type} />,
            }))}
          />
        )
      }
    >
      {open && (
        <ChoiceList
          key={picking}
          searchLabel={open.search}
          noun={open.noun}
          sections={open.sections}
          selectedId={open.selected}
          onChoose={(id) => {
            open.choose(id);
            setPicking(null);
          }}
        />
      )}

      {/* The ledger's own rules explain a bad date or amount on the field; the browser's bubbles would not. */}
      <form
        noValidate
        hidden={picking !== null}
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
        <div className="pt-3">
          <MoneyInput
            ref={amountRef}
            size="hero"
            value={amount}
            onValueChange={setAmount}
            aria-label="Amount in taka"
            placeholder="0"
            {...errorProps("quick-amount", errors.amount)}
          />
          {errors.amount && (
            <p id="quick-amount-error" className="mt-2 text-center text-meta text-negative">
              {errors.amount}
            </p>
          )}
        </div>

        <Effects effects={effects} />

        {accounts.length === 0 && (
          // A fresh start (Settings → Clear all data) has no account to record against yet.
          <p className="mb-3 rounded-control bg-surface-subtle px-3 py-2 text-meta text-ink-2">
            Nothing can be recorded until there is an account.{" "}
            <Link href="/accounts" className={linkClass} onClick={onClose}>
              Open one in Accounts
            </Link>
          </p>
        )}

        <div className="relative overflow-hidden rounded-[14px] border border-line">
          <div className="divide-y divide-line-soft">
            {type === "transfer" ? (
              <>
                <Row
                  rowRef={(el) => {
                    rowRefs.current.account = el;
                  }}
                  label="From"
                  value={account?.name}
                  icon={account ? accountIcon(account.type) : TransferIcon}
                  error={errors.accountId}
                  errorId="quick-from-error"
                  disabled={accounts.length === 0}
                  onOpen={() => pick("account")}
                />
                <Row
                  rowRef={(el) => {
                    rowRefs.current.counter = el;
                  }}
                  label="To"
                  value={counter?.name}
                  tag={cardPayment ? <Tag tone="info">Card payment</Tag> : null}
                  icon={counter ? accountIcon(counter.type) : TransferIcon}
                  error={errors.counterAccountId}
                  errorId="quick-to-error"
                  disabled={accounts.length === 0}
                  onOpen={() => pick("counter")}
                />
              </>
            ) : (
              <>
                <Row
                  rowRef={(el) => {
                    rowRefs.current.category = el;
                  }}
                  label="Category"
                  value={noCategory ? "None available" : category?.name}
                  icon={categoryIcon(category?.name)}
                  tone={KIND_STYLE[kind].glyph}
                  error={errors.categoryId}
                  errorId="quick-category-error"
                  disabled={noCategory}
                  onOpen={() => pick("category")}
                />
                <Row
                  rowRef={(el) => {
                    rowRefs.current.account = el;
                  }}
                  label={accountLabel(type)}
                  value={account?.name}
                  icon={accountIcon(account?.type ?? "cash")}
                  error={errors.accountId}
                  errorId="quick-account-error"
                  disabled={accounts.length === 0}
                  onOpen={() => pick("account")}
                />
              </>
            )}
          </div>
          {type === "transfer" && (
            <button
              type="button"
              aria-label="Swap From and To accounts"
              title="Swap From and To accounts"
              onClick={() => {
                setAccountId(counterAccountId);
                setCounterAccountId(accountId);
              }}
              className="absolute top-1/2 right-11 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-ocean shadow-panel transition-colors hover:border-ocean sm:size-9"
            >
              <ArrowUpDown aria-hidden className="size-4" strokeWidth={2} />
            </button>
          )}
        </div>
        <RowErrors
          errors={[
            ["quick-category-error", type === "transfer" ? undefined : errors.categoryId],
            [type === "transfer" ? "quick-from-error" : "quick-account-error", errors.accountId],
            ["quick-to-error", type === "transfer" ? errors.counterAccountId : undefined],
          ]}
        />

        {type === "transfer" &&
          (showFee ? (
            // One line from 640px; on phones the amount sits above its category, so neither is cramped.
            <div className="mt-3 overflow-hidden rounded-[14px] border border-line sm:flex sm:items-center">
              <div className="flex items-end gap-2 px-3 py-2">
                <div className="w-28">
                  <label htmlFor="quick-fee" className="mb-1 block text-meta text-ink-2">
                    Fee
                  </label>
                  <MoneyInput
                    id="quick-fee"
                    value={fee}
                    onValueChange={setFee}
                    placeholder="0"
                    {...errorProps("quick-fee", errors.fee)}
                  />
                </div>
                <RemoveFee
                  className="ml-auto sm:hidden"
                  onRemove={() => {
                    setShowFee(false);
                    setFee("");
                  }}
                />
              </div>
              <div className="min-w-0 flex-1 border-t border-line-soft sm:border-t-0">
                <Row
                  rowRef={(el) => {
                    rowRefs.current.feeCategory = el;
                  }}
                  label="Fee category"
                  value={feeCategory?.name}
                  icon={categoryIcon(feeCategory?.name)}
                  tone={KIND_STYLE.expense.glyph}
                  error={errors.feeCategoryId}
                  errorId="quick-fee-category-error"
                  onOpen={() => pick("feeCategory")}
                />
              </div>
              <RemoveFee
                className="mr-1.5 max-sm:hidden"
                onRemove={() => {
                  setShowFee(false);
                  setFee("");
                }}
              />
            </div>
          ) : (
            feeCategories.length > 0 && (
              <button
                type="button"
                className={cn(quietAction, "mt-2 -ml-2")}
                onClick={() => setShowFee(true)}
              >
                <Plus aria-hidden className="size-3.5" strokeWidth={2.25} />
                Add a fee
              </button>
            )
          ))}
        {showFee && (
          <RowErrors
            errors={[
              ["quick-fee-error", errors.fee],
              ["quick-fee-category-error", errors.feeCategoryId],
            ]}
          />
        )}

        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          onPointerDown={() => (datePointer.current = true)}
        >
          <Segmented
            label="Date"
            size="sm"
            value={dateChoice}
            onChange={chooseDate}
            options={[
              { value: "today", label: "Today" },
              { value: "yesterday", label: "Yesterday" },
              { value: "earlier", label: "Earlier" },
            ]}
          />
          {dateChoice === "earlier" && (
            <div className="w-38">
              <Input
                ref={dateRef}
                type="date"
                aria-label="Earlier date"
                max={data.today}
                value={occurredOn}
                onChange={(e) => e.target.value && setOccurredOn(e.target.value as CalendarDate)}
                controlSize="xs"
                {...errorProps("quick-date", errors.occurredOn)}
              />
            </div>
          )}
          {!describing && description === "" && (
            <button
              type="button"
              className={cn(quietAction, "ml-auto")}
              onClick={() => {
                setDescribing(true);
                requestAnimationFrame(() => descriptionRef.current?.focus());
              }}
            >
              <Plus aria-hidden className="size-3.5" strokeWidth={2.25} />
              Add description
            </button>
          )}
        </div>
        {errors.occurredOn && (
          <p id="quick-date-error" className="mt-1.5 text-meta text-negative">
            {errors.occurredOn}
          </p>
        )}

        {(describing || description !== "") && (
          <div className="mt-3">
            <Input
              ref={descriptionRef}
              id="quick-description"
              aria-label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === "transfer" ? "e.g. Cash-out" : "e.g. Lunch at Star Kabab"}
              maxLength={120}
              {...errorProps("quick-description", errors.description)}
            />
            {errors.description && (
              <p id="quick-description-error" className="mt-1.5 text-meta text-negative">
                {errors.description}
              </p>
            )}
          </div>
        )}

        {noCategory && (
          // Categories are managed on their own page only; Quick Add just says why it cannot record.
          <p
            id="quick-no-category"
            className="mt-4 rounded-control bg-surface-subtle px-3 py-2 text-meta text-ink-2"
          >
            No active {KIND_TITLE[kind]} Categories are available.
          </p>
        )}
        <div className="mt-4 empty:hidden">
          <FormMessage>{message}</FormMessage>
        </div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          pending={pending}
          disabled={noCategory}
          aria-describedby={noCategory ? "quick-no-category" : undefined}
          className="mt-4 w-full"
        >
          {saveLabel}
        </Button>
      </form>
    </Modal>
  );
}

const KIND_TITLE: Record<CategoryKind, string> = { expense: "Expense", income: "Income" };

/** A quiet text action in ocean ("Add a fee", "Add description"). */
const quietAction =
  "inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-meta font-semibold text-ocean transition-colors hover:bg-surface-hover";

const accountLabel = (type: EntryType) =>
  type === "income" ? "Received in" : type === "transfer" ? "From" : "Paid from";

function TypeLabel({ type, selected }: { readonly type: EntryType; readonly selected: boolean }) {
  const { label, icon: Icon, mark } = TYPES[type];
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full",
          selected ? mark : "text-ink-3",
        )}
      >
        <Icon className="size-3" strokeWidth={2.25} />
      </span>
      {label}
    </>
  );
}

/** One side of the entry's relationship (its category, or an account): a row that opens a list. */
function Row({
  label,
  value,
  icon,
  tone = "neutral",
  tag,
  error,
  errorId,
  disabled,
  onOpen,
  rowRef,
}: {
  readonly label: string;
  readonly value: string | undefined;
  readonly icon: LucideIcon;
  readonly tone?: GlyphTone;
  readonly tag?: ReactNode;
  readonly error?: string | undefined;
  readonly errorId: string;
  readonly disabled?: boolean;
  readonly onOpen: () => void;
  readonly rowRef: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onOpen}
      disabled={disabled}
      data-invalid={error ? "" : undefined}
      aria-describedby={error ? errorId : undefined}
      className="flex min-h-15 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-subtle focus-visible:-outline-offset-2 disabled:cursor-default disabled:hover:bg-transparent data-invalid:bg-negative-soft/40"
    >
      <Glyph icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block text-meta text-ink-2">{label}</span>{" "}
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "truncate text-heading",
              value ? "font-semibold text-ink" : "font-medium text-ink-3",
            )}
          >
            {value ?? "Choose"}
          </span>
          {tag}
        </span>
      </span>
      {!disabled && <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />}
    </button>
  );
}

function RemoveFee({
  onRemove,
  className,
}: {
  readonly onRemove: () => void;
  readonly className: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Remove the fee"
      className={className}
      onClick={onRemove}
    >
      <X aria-hidden className="size-4" strokeWidth={1.75} />
    </Button>
  );
}

function RowErrors({
  errors,
}: {
  readonly errors: readonly (readonly [string, string | undefined])[];
}) {
  const shown = errors.filter(([, error]) => error);
  if (shown.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {shown.map(([id, error]) => (
        <p key={id} id={id} className="text-meta text-negative">
          {error}
        </p>
      ))}
    </div>
  );
}

/**
 * What the entry will do to its account(s), once there is an amount and every
 * account it needs. The space stays empty (not filled with copy) until then.
 */
function Effects({ effects }: { readonly effects: readonly AccountEffect[] | null }) {
  return (
    <div className="flex min-h-13 flex-wrap items-start justify-center gap-x-8 gap-y-2 pt-2 pb-4">
      {effects?.map((effect) => {
        // Poisha only where they exist (a fee of ৳18.50), for that account's two figures.
        const exact = effect.before % 100 !== 0 || effect.after % 100 !== 0;
        return (
          <p key={effect.accountId} className="text-center">
            <span className="block text-micro font-medium text-ink-2">{effect.name}</span>
            <span className="inline-flex items-center gap-1.5 text-body">
              <Balance
                type={effect.type}
                amount={effect.before}
                exact={exact}
                className="text-ink-2"
              />
              <ChevronRight aria-hidden className="size-3.5 text-ink-3" strokeWidth={2} />
              <span className="sr-only">after this,</span>
              <Balance
                type={effect.type}
                amount={effect.after}
                exact={exact}
                className="font-semibold text-ink"
              />
            </span>
          </p>
        );
      })}
    </div>
  );
}

/** A balance as people read it: a card's as what is owed (or held in credit). */
function Balance({
  type,
  amount,
  exact = false,
  className,
}: {
  readonly type: AccountType;
  readonly amount: Money;
  readonly exact?: boolean;
  readonly className?: string;
}) {
  const precision = exact ? "minor" : "major";
  if (accountClass(type) !== "liability") {
    return <Amount amount={amount} precision={precision} className={className} />;
  }
  const standing = liabilityStanding(amount);
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <Amount amount={standing.amount} sign="none" precision={precision} />
      {standing.kind === "owed" ? " owed" : standing.kind === "credit" ? " credit" : ""}
    </span>
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

const byName = <T extends { readonly name: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => a.name.localeCompare(b.name));

/**
 * The categories the list puts first: the last used, then the most used over
 * the last 90 days (both already remembered by the ledger), without repeats,
 * only active ones of the kind, at most three.
 */
export function recentCategories(
  data: QuickAddData,
  kind: CategoryKind,
): readonly QuickAddCategory[] {
  const last =
    kind === "income" ? data.defaults.income?.categoryId : data.defaults.expense?.categoryId;
  const ids = [...new Set([last, ...data.defaults.frequentCategoryIds[kind]])];
  return ids
    .map((id) => data.categories.find((c) => c.id === id && c.kind === kind))
    .filter((c): c is QuickAddCategory => c !== undefined)
    .slice(0, RECENT_CATEGORIES);
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
