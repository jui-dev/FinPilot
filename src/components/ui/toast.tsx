"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * One toast at a time, announced politely, with an optional action (Undo).
 * Messages state the effect ("Saved −৳450 · Cash ৳4,200 → ৳3,750").
 */

export interface ToastInput {
  readonly message: ReactNode;
  readonly action?: { readonly label: string; readonly onAction: () => void | Promise<void> };
  readonly tone?: "default" | "error";
}

interface ToastState extends ToastInput {
  readonly id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

const REGION = "data-toast-region";

/** Whether an event target is inside the toast region (overlay.tsx keeps it from dismissing). */
export const isInToastRegion = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(`[${REGION}]`) !== null;

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);

  const show = useCallback((input: ToastInput) => {
    nextId.current += 1;
    setToast({ ...input, id: nextId.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.action ? 8000 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Above the phone tab bar, or near the bottom from 768px. While an overlay
          is open the region moves to the top, clear of bottom sheets and centred
          dialogs, and from 768px stops short of the 440px side panel (overlay.tsx). */}
      <div
        {...{ [REGION]: "" }}
        aria-live="polite"
        className={
          "pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6 " +
          "[body:has([role=dialog])_&]:top-[max(0.5rem,env(safe-area-inset-top))] [body:has([role=dialog])_&]:bottom-auto md:[body:has([role=dialog])_&]:right-[440px]"
        }
      >
        {toast && (
          <div
            key={toast.id}
            role="status"
            className={
              "pointer-events-auto flex max-w-[min(560px,100%)] animate-pop-in items-center gap-4 rounded-control px-4 py-3 text-body shadow-overlay " +
              (toast.tone === "error" ? "bg-negative text-white" : "bg-ink text-white")
            }
          >
            <span className="min-w-0">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                disabled={busy}
                className="shrink-0 font-semibold underline underline-offset-4 disabled:opacity-60"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await toast.action?.onAction();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
