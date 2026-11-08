"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { useOpenQuickAdd } from "../shell/quick-add-opener";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import type { GuideTarget } from "./content";

const LINK = cn("inline-flex items-center gap-1.5 text-body font-semibold text-ocean", "group");

/** A step's way in: the page where it is done, or Quick Add opened in place. */
export function StepLink({ label, to }: { readonly label: string; readonly to: GuideTarget }) {
  const openQuickAdd = useOpenQuickAdd();
  const face = (
    <>
      <span className={linkClass}>{label}</span>
      <ArrowRight
        aria-hidden
        className="size-4 transition-transform group-hover:translate-x-0.5"
        strokeWidth={1.75}
      />
    </>
  );
  return "href" in to ? (
    <Link href={to.href} className={LINK}>
      {face}
    </Link>
  ) : (
    <button type="button" onClick={openQuickAdd} className={LINK}>
      {face}
    </button>
  );
}
