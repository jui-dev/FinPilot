"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import { clearAllDataAction, resetDemoDataAction } from "@/app/_server/actions";
import { CLEAR_CONFIRMATION } from "@/domain/clear-confirmation";

import { Button } from "../ui/button";
import { Field, FormMessage, Input } from "../ui/field";
import { Modal } from "../ui/overlay";
import { Panel, PanelHeader } from "../ui/panel";
import { useToast } from "../ui/toast";
import { ControlRow } from "./control-row";

/** Shown when an action fails unexpectedly: both operations are all-or-nothing. */
const UNEXPECTED = "Something went wrong, and nothing was changed. Try again.";

/**
 * Settings' Data & demo: replace everything with the demo, or clear it all to
 * a fresh start. Both are whole-ledger server operations, rendered only where
 * the environment enables them (src/server/data-controls.ts). Reset is
 * confirmed in a dialog; Clear is apart, in the danger zone, and needs CLEAR
 * typed exactly (the server checks it too).
 */
export function DataControls() {
  return (
    <>
      <Panel labelledBy="settings-data" className="overflow-hidden">
        <PanelHeader id="settings-data" title="Data & demo" />
        <ControlRow
          title="Demo data"
          description="Restore FinPilot's realistic sample financial history. Useful for exploring features, development and demonstrations."
        >
          <ResetDemo />
        </ControlRow>
      </Panel>

      <Panel labelledBy="settings-danger" className="overflow-hidden">
        <PanelHeader
          id="settings-danger"
          title={<span className="text-negative">Danger zone</span>}
        />
        <ControlRow
          title="Clear all data"
          description="Permanently remove your financial records and return FinPilot to a fresh-start state. Download a backup first if you may want them back."
        >
          <ClearAll />
        </ControlRow>
      </Panel>
    </>
  );
}

function ResetDemo() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = async () => {
    setPending(true);
    setError(null);
    const result = await resetDemoDataAction().catch(() => null);
    setPending(false);
    if (!result?.ok) {
      setError(result?.message ?? UNEXPECTED);
      return;
    }
    setOpen(false);
    toast({ message: "Demo data restored." });
  };

  return (
    <>
      <Button icon={<RotateCcw className="size-4" />} onClick={() => setOpen(true)}>
        Reset to demo data
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          setError(null);
        }}
        title="Reset to demo data?"
        description="Everything in FinPilot is replaced by the sample financial history, and anything you have recorded is removed."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" pending={pending} onClick={() => void reset()}>
              Reset to demo data
            </Button>
          </div>
        }
      >
        {error ? (
          <FormMessage>{error}</FormMessage>
        ) : (
          <span className="sr-only">Confirm the reset</span>
        )}
      </Modal>
    </>
  );
}

function ClearAll() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed === CLEAR_CONFIRMATION;

  const close = () => {
    setOpen(false);
    setTyped("");
    setError(null);
  };

  const clear = async () => {
    if (!confirmed) return;
    setPending(true);
    setError(null);
    const result = await clearAllDataAction(typed).catch(() => null);
    setPending(false);
    if (!result?.ok) {
      setError(result?.message ?? UNEXPECTED);
      return;
    }
    close();
    toast({ message: "All data cleared. FinPilot is ready for a fresh start." });
  };

  return (
    <>
      <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setOpen(true)}>
        Clear all data
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          if (next) setOpen(true);
          else close();
        }}
        title="Clear all data?"
        description="Every account, entry, commitment, set-aside amount and verification is permanently removed, and categories return to the defaults. This cannot be undone."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={pending} onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="clear-all-data"
              variant="destructive"
              pending={pending}
              disabled={!confirmed}
            >
              Clear all data
            </Button>
          </div>
        }
      >
        <form
          id="clear-all-data"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void clear();
          }}
        >
          <Field
            label={
              <>
                Type <span className="font-semibold text-ink">{CLEAR_CONFIRMATION}</span> to confirm
              </>
            }
            htmlFor="clear-confirmation"
          >
            <Input
              id="clear-confirmation"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={pending}
            />
          </Field>
          <FormMessage>{error}</FormMessage>
        </form>
      </Modal>
    </>
  );
}
