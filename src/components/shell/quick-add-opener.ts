"use client";

import { createContext, useContext } from "react";

/**
 * Opens Quick Add, the one global action, from inside a page (the Guide's
 * "Open Quick Add"). The application shell owns Quick Add and provides this;
 * outside the shell it does nothing.
 */
export const QuickAddOpener = createContext<() => void>(() => {});

export const useOpenQuickAdd = () => useContext(QuickAddOpener);
