"use server";

import { refresh } from "next/cache";

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
