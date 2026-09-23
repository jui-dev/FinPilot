"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  archiveAccountAction,
  deleteAccountAction,
  restoreAccountAction,
} from "@/app/_server/actions";

import { Button } from "../ui/button";
import { Modal } from "../ui/overlay";
import { useToast } from "../ui/toast";

/**
 * Only the actions the ledger allows are offered: archiving needs a zero
 * balance, deleting needs an account nothing ever referenced. Archiving is
 * reversible, so it is confirmed by an Undo message rather than a dialog.
 */
export function AccountActions({
  id,
  name,
  canArchive,
  canDelete,
  archived,
}: {
  readonly id: string;
  readonly name: string;
  readonly canArchive: boolean;
  readonly canDelete: boolean;
  readonly archived: boolean;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  const archive = async () => {
    setPending(true);
    const result = await archiveAccountAction(id);
    setPending(false);
    toast({
      message: result.ok ? `${name} archived.` : result.message,
      tone: result.ok ? "default" : "error",
      ...(result.ok
        ? {
            action: {
              label: "Undo",
              onAction: async () => {
                const restored = await restoreAccountAction(id);
                toast({
                  message: restored.ok ? `${name} restored.` : restored.message,
                  tone: restored.ok ? "default" : "error",
                });
              },
            },
          }
        : {}),
    });
  };

  const restore = async () => {
    setPending(true);
    const result = await restoreAccountAction(id);
    setPending(false);
    toast({
      message: result.ok ? `${name} restored.` : result.message,
      tone: result.ok ? "default" : "error",
    });
  };

  const remove = async () => {
    setPending(true);
    const result = await deleteAccountAction(id);
    setPending(false);
    setConfirming(false);
    toast({
      message: result.ok ? `${name} deleted.` : result.message,
      tone: result.ok ? "default" : "error",
    });
  };

  return (
    <div className="flex items-center gap-0.5">
      {archived ? (
        <Button
          variant="ghost"
          size="sm"
          pending={pending}
          icon={<ArchiveRestore className="size-4" />}
          onClick={() => void restore()}
        >
          Restore
        </Button>
      ) : (
        canArchive && (
          <Button
            variant="ghost"
            size="sm"
            pending={pending}
            icon={<Archive className="size-4" />}
            onClick={() => void archive()}
            title="Archive this account"
          >
            Archive
          </Button>
        )
      )}
      {canDelete && (
        <>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="size-4" />}
            onClick={() => setConfirming(true)}
            title="Delete this account"
          >
            Delete
          </Button>
          <Modal
            open={confirming}
            onOpenChange={setConfirming}
            title={`Delete ${name}?`}
            description="Nothing has ever been recorded on it, so nothing is lost. This cannot be undone."
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button variant="primary" pending={pending} onClick={() => void remove()}>
                  Delete account
                </Button>
              </div>
            }
          >
            <span className="sr-only">Confirm deleting {name}</span>
          </Modal>
        </>
      )}
    </div>
  );
}
