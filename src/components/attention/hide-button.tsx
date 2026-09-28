"use client";

import { EyeOff } from "lucide-react";
import { useState } from "react";

import { dismissSignalAction, undismissSignalAction } from "@/app/_server/actions";

import { Button } from "../ui/button";
import { useToast } from "../ui/toast";

/**
 * Hide, then Undo in the toast (docs/domain-model.md §11). Offered only on a
 * signal that can be hidden; the server checks that again. The list is
 * re-rendered by the server after each action, and focus returns to the
 * list's heading, since the row that held it is gone.
 */
export function HideButton({
  signalKey,
  title,
  until,
  focusId,
}: {
  readonly signalKey: string;
  readonly title: string;
  /** "September" for a month's signal; null when it is hidden for good. */
  readonly until: string | null;
  /** The element that takes focus once the row is gone. */
  readonly focusId: string;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const hidden = until ? `Hidden for ${until}.` : "Hidden.";

  const hide = async () => {
    setPending(true);
    const result = await dismissSignalAction(signalKey);
    setPending(false);
    if (!result.ok) {
      toast({ message: result.message, tone: "error" });
      return;
    }
    document.getElementById(focusId)?.focus();
    toast({
      message: hidden,
      action: {
        label: "Undo",
        onAction: async () => {
          const shown = await undismissSignalAction(signalKey);
          toast({
            message: shown.ok ? "Shown again." : shown.message,
            tone: shown.ok ? "default" : "error",
          });
        },
      },
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="max-md:h-10"
      icon={<EyeOff aria-hidden className="size-4" />}
      pending={pending}
      onClick={() => void hide()}
    >
      Hide
      <span className="sr-only">
        {" "}
        {title}
        {until ? ` for ${until}` : ""}
      </span>
    </Button>
  );
}
