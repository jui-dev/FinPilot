"use server";

import { refresh, revalidatePath } from "next/cache";

import * as commands from "@/server/commands";
import type { CommandResult, RecordedTransaction } from "@/server/commands";
import type { ServiceContext } from "@/server/context";

import { actionContext } from "./context";

/**
 * Server actions: thin, public entry points. Every argument is untrusted
 * (actions are reachable over HTTP), so ids are checked to be strings and
 * payloads are validated by the commands' shared schemas. A successful write
 * refreshes the current route so every derived number is re-read.
 */

async function run<T>(
  command: (ctx: ServiceContext) => Promise<CommandResult<T>>,
): Promise<CommandResult<T>> {
  const result = await command(actionContext());
  if (result.ok) refresh();
  return result;
}

const idOf = (value: unknown): string => (typeof value === "string" ? value : "");

export async function recordEntryAction(
  input: unknown,
): Promise<CommandResult<RecordedTransaction>> {
  return run((ctx) => commands.recordEntry(ctx, input));
}

export async function editEntryAction(id: unknown, input: unknown): Promise<CommandResult> {
  return run((ctx) => commands.editEntry(ctx, idOf(id), input));
}

export async function editOpeningBalanceAction(
  id: unknown,
  input: unknown,
): Promise<CommandResult> {
  return run((ctx) => commands.editOpeningBalance(ctx, idOf(id), input));
}

export async function refundExpenseAction(
  expenseId: unknown,
  input: unknown,
): Promise<CommandResult<RecordedTransaction>> {
  return run((ctx) => commands.refundExpense(ctx, idOf(expenseId), input));
}

export async function removeEntryAction(id: unknown): Promise<CommandResult<string[]>> {
  return run((ctx) => commands.removeEntry(ctx, idOf(id)));
}

export async function restoreEntryAction(id: unknown): Promise<CommandResult<string[]>> {
  return run((ctx) => commands.restoreEntry(ctx, idOf(id)));
}

export async function verifyBalanceAction(
  input: unknown,
): Promise<CommandResult<commands.VerifiedBalance>> {
  return run((ctx) => commands.verifyBalance(ctx, input));
}

export async function openAccountAction(input: unknown): Promise<CommandResult<string>> {
  return run((ctx) => commands.openAccount(ctx, input));
}

export async function archiveAccountAction(id: unknown): Promise<CommandResult> {
  return run((ctx) => commands.archiveAccount(ctx, idOf(id)));
}

export async function restoreAccountAction(id: unknown): Promise<CommandResult> {
  return run((ctx) => commands.restoreAccount(ctx, idOf(id)));
}

export async function deleteAccountAction(id: unknown): Promise<CommandResult> {
  return run((ctx) => commands.deleteAccount(ctx, idOf(id)));
}

export async function addCategoryAction(input: unknown): Promise<CommandResult<string>> {
  return run((ctx) => commands.addCategory(ctx, input));
}

export async function renameCategoryAction(id: unknown, name: unknown): Promise<CommandResult> {
  return run((ctx) => commands.renameCategory(ctx, idOf(id), name));
}

export async function archiveCategoryAction(id: unknown): Promise<CommandResult> {
  return run((ctx) => commands.archiveCategory(ctx, idOf(id)));
}

export async function restoreCategoryAction(id: unknown): Promise<CommandResult> {
  return run((ctx) => commands.restoreCategory(ctx, idOf(id)));
}

export async function deleteCategoryAction(id: unknown): Promise<CommandResult> {
  return run((ctx) => commands.deleteCategory(ctx, idOf(id)));
}

export async function createCommitmentAction(input: unknown): Promise<CommandResult<string>> {
  return run((ctx) => commands.createCommitment(ctx, input));
}

export async function editCommitmentAction(id: unknown, input: unknown): Promise<CommandResult> {
  return run((ctx) => commands.editCommitment(ctx, idOf(id), input));
}

/** Records the occurrence's payment as a real expense. Returns the transaction id (for Undo). */
export async function payOccurrenceAction(
  occurrenceId: unknown,
  input: unknown,
): Promise<CommandResult<string>> {
  return run((ctx) => commands.payOccurrence(ctx, idOf(occurrenceId), input));
}

export async function skipOccurrenceAction(occurrenceId: unknown): Promise<CommandResult> {
  return run((ctx) => commands.skipOccurrence(ctx, idOf(occurrenceId)));
}

// Set aside (protected money)

export async function createProtectedMoneyItemAction(
  input: unknown,
): Promise<CommandResult<string>> {
  return run((ctx) => commands.createProtectedMoneyItem(ctx, input));
}

export async function editProtectedMoneyItemAction(
  id: unknown,
  input: unknown,
): Promise<CommandResult> {
  return run((ctx) => commands.editProtectedMoneyItem(ctx, idOf(id), input));
}

export async function archiveProtectedMoneyItemAction(id: unknown): Promise<CommandResult> {
  return run((ctx) => commands.archiveProtectedMoneyItem(ctx, idOf(id)));
}

export async function reserveProtectedMoneyAction(
  itemId: unknown,
  input: unknown,
): Promise<CommandResult> {
  return run((ctx) => commands.reserveProtectedMoney(ctx, idOf(itemId), input));
}

export async function releaseProtectedMoneyAction(
  itemId: unknown,
  input: unknown,
): Promise<CommandResult> {
  return run((ctx) => commands.releaseProtectedMoney(ctx, idOf(itemId), input));
}

// Attention

/** Hides a dismissible signal for its episode; the command checks it is one. */
export async function dismissSignalAction(key: unknown): Promise<CommandResult> {
  return run((ctx) => commands.dismissSignal(ctx, key));
}

/** Shows a hidden signal again (Undo). */
export async function undismissSignalAction(key: unknown): Promise<CommandResult> {
  return run((ctx) => commands.undismissSignal(ctx, key));
}

// Data & demo

/**
 * Every page and the ledger layout (Quick Add's accounts and categories) read
 * the data these replace, so all of them are revalidated, not just this route.
 */
async function runWholeLedger(
  command: (ctx: ServiceContext) => Promise<CommandResult>,
): Promise<CommandResult> {
  const result = await command(actionContext());
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Replaces everything with the demo ledger. */
export async function resetDemoDataAction(): Promise<CommandResult> {
  return runWholeLedger((ctx) => commands.resetDemoData(ctx));
}

/** Removes every financial record; `confirmation` must be exactly "CLEAR". */
export async function clearAllDataAction(confirmation: unknown): Promise<CommandResult> {
  return runWholeLedger((ctx) => commands.clearAllData(ctx, confirmation));
}
