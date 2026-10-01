"use client";

import { Archive, LockOpen, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  archiveProtectedMoneyItemAction,
  createProtectedMoneyItemAction,
  editProtectedMoneyItemAction,
  releaseProtectedMoneyAction,
  reserveProtectedMoneyAction,
} from "@/app/_server/actions";
import { formatMoney, type Money as MoneyValue } from "@/domain/money";
import type { CommandResult, FieldErrors } from "@/server/commands";

import { Button, linkClass } from "../ui/button";
import { errorProps, Field, FormMessage, Input, Select } from "../ui/field";
import { formatTypedAmount, MoneyInput } from "../ui/money-input";
import { Modal, SidePanel } from "../ui/overlay";
import { useToast } from "../ui/toast";

/** Money already in one account, set aside for this item. */
export interface Holding {
  readonly accountId: string;
  readonly accountName: string;
  readonly setAside: MoneyValue;
  readonly short: MoneyValue;
}

/** What the item's actions need. */
export interface ActionItem {
  readonly id: string;
  readonly name: string;
  readonly target: MoneyValue | null;
  readonly setAside: MoneyValue;
  readonly holdings: readonly Holding[];
}

/** An account Reserve accepts, and how much more of it may be set aside. */
export interface Source {
  readonly accountId: string;
  readonly name: string;
  readonly free: MoneyValue;
}

const typed = (amount: MoneyValue) => formatTypedAmount(String(amount / 100));

/** One form's submit state: field errors, a form-level message, and pending. */
function useSubmit() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (action: () => Promise<CommandResult<unknown>>, onDone: () => void) => {
    setPending(true);
    setErrors({});
    setMessage(null);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setMessage(Object.keys(result.fieldErrors).length === 0 ? result.message : null);
      return;
    }
    onDone();
  };
  return { errors, message, pending, submit };
}

function FormActions({
  onCancel,
  pending,
  children,
}: {
  readonly onCancel: () => void;
  readonly pending: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-line pt-4">
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" pending={pending}>
        {children}
      </Button>
    </div>
  );
}

/** Opens a panel fresh each time, so no half-typed state survives a close. */
function useSession() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return {
    open,
    session,
    setOpen,
    start: () => {
      setSession((n) => n + 1);
      setOpen(true);
    },
  };
}

// ---------------------------------------------------------------------------
// New purpose / Edit
// ---------------------------------------------------------------------------

export function NewPurposeButton({ emphasized = false }: { readonly emphasized?: boolean }) {
  const panel = useSession();
  return (
    <>
      <Button
        variant={emphasized ? "primary" : "secondary"}
        icon={<Plus className="size-4" strokeWidth={2.25} />}
        onClick={panel.start}
      >
        New purpose
      </Button>
      <ItemPanel key={panel.session} open={panel.open} onOpenChange={panel.setOpen} />
    </>
  );
}

/**
 * Naming what money is set aside for, and optionally how much is wanted for
 * it. Nothing is set aside here: that is always a separate, explicit step.
 */
function ItemPanel({
  open,
  onOpenChange,
  item,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly item?: ActionItem;
}) {
  const toast = useToast();
  const editing = item !== undefined;
  const [name, setName] = useState(item?.name ?? "");
  const [target, setTarget] = useState(item?.target ? typed(item.target) : "");
  const { errors, message, pending, submit } = useSubmit();
  const [archiving, setArchiving] = useState(false);

  const save = () =>
    submit(
      () =>
        editing
          ? editProtectedMoneyItemAction(item.id, { name, target })
          : createProtectedMoneyItemAction({ name, target }),
      () => {
        toast({
          message: editing
            ? `${name.trim()} saved.`
            : `${name.trim()} added. Nothing is set aside until you choose an amount.`,
        });
        onOpenChange(false);
      },
    );

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${item.name}` : "New purpose"}
      description={
        editing
          ? "Changing the name or target never sets money aside or releases it."
          : "What are you setting money aside for? Nothing is set aside until you choose an amount."
      }
    >
      <form
        className="flex flex-col gap-4 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="What is it for?" htmlFor="set-aside-name" error={errors.name}>
          <Input
            id="set-aside-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Laptop, Emergency fund"
            maxLength={40}
            autoFocus
            {...errorProps("set-aside-name", errors.name)}
          />
        </Field>
        <Field
          label="Target (optional)"
          htmlFor="set-aside-target"
          error={errors.target}
          hint="How much you want for it. Leave it empty for money you simply keep aside, like an emergency fund."
        >
          <MoneyInput
            id="set-aside-target"
            value={target}
            onValueChange={setTarget}
            placeholder="No target"
            {...errorProps("set-aside-target", errors.target)}
          />
        </Field>
        <FormMessage>{message}</FormMessage>
        <FormActions onCancel={() => onOpenChange(false)} pending={pending}>
          {editing ? "Save changes" : "Add"}
        </FormActions>
      </form>

      {editing && (
        <section
          aria-labelledby="set-aside-archive"
          className="mt-6 flex flex-col gap-2 border-t border-line pt-4"
        >
          <h3 id="set-aside-archive" className="text-body font-semibold text-ink">
            Archive
          </h3>
          {item.setAside > 0 ? (
            <p className="text-meta text-ink-2">
              {formatMoney(item.setAside)} is still set aside for {item.name}. Release it before
              archiving.
            </p>
          ) : (
            <p className="text-meta text-ink-2">
              Archiving is final: {item.name} moves to Archived and can no longer be changed.
            </p>
          )}
          <div>
            <Button
              size="sm"
              icon={<Archive className="size-4" />}
              disabled={item.setAside > 0}
              onClick={() => setArchiving(true)}
            >
              Archive {item.name}
            </Button>
          </div>
          <ArchiveConfirm
            item={item}
            open={archiving}
            onOpenChange={setArchiving}
            onArchived={() => onOpenChange(false)}
          />
        </section>
      )}
    </SidePanel>
  );
}

function ArchiveConfirm({
  item,
  open,
  onOpenChange,
  onArchived,
}: {
  readonly item: ActionItem;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onArchived: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const archive = async () => {
    setPending(true);
    const result = await archiveProtectedMoneyItemAction(item.id);
    setPending(false);
    onOpenChange(false);
    toast({
      message: result.ok ? `${item.name} archived.` : result.message,
      tone: result.ok ? "default" : "error",
    });
    if (result.ok) onArchived();
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Archive ${item.name}?`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" pending={pending} onClick={() => void archive()}>
            Archive
          </Button>
        </div>
      }
    >
      <p className="text-body text-ink-2">
        Archiving is final. {item.name} stays listed under Archived, but can&apos;t be changed or
        used again.
      </p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// An item's actions: Set aside, Release, Edit
// ---------------------------------------------------------------------------

export function ItemActions({
  item,
  sources,
}: {
  readonly item: ActionItem;
  readonly sources: readonly Source[];
}) {
  const reserve = useSession();
  const release = useSession();
  const edit = useSession();
  const nothingYet = item.setAside === 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="soft"
        icon={<Plus className="size-4" strokeWidth={2.25} />}
        onClick={reserve.start}
      >
        {nothingYet ? "Set money aside" : "Set aside more"}
        <span className="sr-only"> for {item.name}</span>
      </Button>
      {!nothingYet && (
        <Button
          size="sm"
          variant="quiet"
          icon={<LockOpen className="size-4" />}
          onClick={release.start}
        >
          Release
          <span className="sr-only"> money set aside for {item.name}</span>
        </Button>
      )}
      <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={edit.start}>
        Edit
        <span className="sr-only"> {item.name}</span>
      </Button>

      <ReservePanel
        key={`r${reserve.session}`}
        open={reserve.open}
        onOpenChange={reserve.setOpen}
        item={item}
        sources={sources}
      />
      {!nothingYet && (
        <ReleasePanel
          key={`l${release.session}`}
          open={release.open}
          onOpenChange={release.setOpen}
          item={item}
        />
      )}
      <ItemPanel
        key={`e${edit.session}`}
        open={edit.open}
        onOpenChange={edit.setOpen}
        item={item}
      />
    </div>
  );
}

/** Setting money aside: which account holds it, and how much. Nothing moves. */
function ReservePanel({
  open,
  onOpenChange,
  item,
  sources,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly item: ActionItem;
  readonly sources: readonly Source[];
}) {
  const toast = useToast();
  const usable = sources.filter((s) => s.free > 0);
  const [accountId, setAccountId] = useState(usable.length === 1 ? usable[0]!.accountId : "");
  const [amount, setAmount] = useState("");
  const { errors, message, pending, submit } = useSubmit();
  const chosen = sources.find((s) => s.accountId === accountId);

  const save = () =>
    submit(
      () => reserveProtectedMoneyAction(item.id, { accountId, amount }),
      () => {
        toast({
          message: `৳${formatTypedAmount(amount)} set aside for ${item.name} from ${chosen?.name ?? "the account"}.`,
        });
        onOpenChange(false);
      },
    );

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={`Set money aside for ${item.name}`}
      description="The money stays in the account. FinPilot records that it's meant for this."
    >
      {usable.length === 0 ? (
        <div className="flex flex-col gap-3 pt-1 text-body text-ink-2">
          <p>
            {sources.length === 0
              ? "There is no account to set money aside from. Money can be set aside only from an account you own, like cash, a bank or a wallet — not a credit card."
              : "None of your accounts has money free to set aside right now — each is empty or already fully set aside."}
          </p>
          <p>
            <Link href="/accounts" className={linkClass}>
              Go to Accounts
            </Link>
          </p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4 pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field
            label="From account"
            htmlFor="reserve-account"
            error={errors.accountId}
            hint={
              chosen
                ? `${formatMoney(chosen.free)} free to set aside in ${chosen.name}.`
                : undefined
            }
          >
            <Select
              id="reserve-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              {...errorProps("reserve-account", errors.accountId)}
            >
              <option value="" disabled>
                Choose an account
              </option>
              {sources.map((s) => (
                <option key={s.accountId} value={s.accountId} disabled={s.free === 0}>
                  {s.name} — {s.free > 0 ? `${formatMoney(s.free)} free` : "nothing free"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount" htmlFor="reserve-amount" error={errors.amount}>
            <MoneyInput
              id="reserve-amount"
              value={amount}
              onValueChange={setAmount}
              placeholder="0"
              {...errorProps("reserve-amount", errors.amount)}
            />
          </Field>
          <FormMessage>{message}</FormMessage>
          <FormActions onCancel={() => onOpenChange(false)} pending={pending}>
            Set aside
          </FormActions>
        </form>
      )}
    </SidePanel>
  );
}

/** Releasing: the money stays where it is and becomes free again. */
function ReleasePanel({
  open,
  onOpenChange,
  item,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly item: ActionItem;
}) {
  const toast = useToast();
  const [accountId, setAccountId] = useState(
    item.holdings.length === 1 ? item.holdings[0]!.accountId : "",
  );
  const [amount, setAmount] = useState("");
  const { errors, message, pending, submit } = useSubmit();
  const chosen = item.holdings.find((h) => h.accountId === accountId);

  const save = () =>
    submit(
      () => releaseProtectedMoneyAction(item.id, { accountId, amount }),
      () => {
        toast({
          message: `৳${formatTypedAmount(amount)} released from ${item.name}. It stays in ${chosen?.accountName ?? "the account"}.`,
        });
        onOpenChange(false);
      },
    );

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={`Release money from ${item.name}`}
      description="Releasing doesn't spend or move money. It stays in the account and is simply no longer kept aside."
    >
      <form
        className="flex flex-col gap-4 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field
          label="From account"
          htmlFor="release-account"
          error={errors.accountId}
          hint={
            chosen
              ? `${formatMoney(chosen.setAside)} set aside in ${chosen.accountName}` +
                (chosen.short > 0 ? `, of which ${formatMoney(chosen.short)} is short.` : ".")
              : undefined
          }
        >
          <Select
            id="release-account"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            {...errorProps("release-account", errors.accountId)}
          >
            <option value="" disabled>
              Choose an account
            </option>
            {item.holdings.map((h) => (
              <option key={h.accountId} value={h.accountId}>
                {h.accountName} — {formatMoney(h.setAside)} set aside
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" htmlFor="release-amount" error={errors.amount}>
          <div className="flex items-center gap-2">
            <MoneyInput
              id="release-amount"
              className="flex-1"
              value={amount}
              onValueChange={setAmount}
              placeholder="0"
              {...errorProps("release-amount", errors.amount)}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={!chosen}
              onClick={() => chosen && setAmount(typed(chosen.setAside))}
            >
              Release all
            </Button>
          </div>
        </Field>
        <FormMessage>{message}</FormMessage>
        <FormActions onCancel={() => onOpenChange(false)} pending={pending}>
          Release
        </FormActions>
      </form>
    </SidePanel>
  );
}
