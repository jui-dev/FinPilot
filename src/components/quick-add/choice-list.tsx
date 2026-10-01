"use client";

import { Check, Search, type LucideIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

import { Glyph, type GlyphTone } from "../ledger/icons";
import { cn } from "../ui/cn";
import { controlClass } from "../ui/field";

export interface Choice {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly tone?: GlyphTone;
  /** A quieter second line (an account's type). */
  readonly detail?: string;
  /** Context at the end of the row (an account's balance). */
  readonly aside?: ReactNode;
}

export interface ChoiceSection {
  /** Shown above the section's choices; omitted for a single plain list. */
  readonly title?: string;
  readonly choices: readonly Choice[];
}

/**
 * A searchable list that replaces Quick Add's form while a choice is made: an
 * editable combobox (WAI-ARIA APG) whose listbox is always shown. Focus stays
 * in the search field; ↑ ↓ Home End move the highlight (announced through
 * aria-activedescendant), Enter chooses it, a click or tap chooses directly.
 * Escape is the dialog's (it steps back to the form). Nothing here is inside
 * the form, so Enter can never save the entry.
 */
export function ChoiceList({
  searchLabel,
  noun,
  sections,
  selectedId,
  onChoose,
}: {
  readonly searchLabel: string;
  /** What is being chosen, for the no-match message ("category", "account"). */
  readonly noun: string;
  readonly sections: readonly ChoiceSection[];
  readonly selectedId: string;
  readonly onChoose: (id: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const visible = useMemo<readonly ChoiceSection[]>(() => {
    const q = query.trim().toLocaleLowerCase();
    if (q === "") return sections.filter((s) => s.choices.length > 0);
    const matches = sections
      .flatMap((s) => s.choices)
      .filter((c) => c.label.toLocaleLowerCase().includes(q));
    return matches.length > 0 ? [{ choices: matches }] : [];
  }, [query, sections]);
  const flat = visible.flatMap((s) => s.choices);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      flat.findIndex((c) => c.id === selectedId),
    ),
  );
  const current = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (current >= 0)
      document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const last = flat.length - 1;
    const move: Partial<Record<string, number>> = {
      ArrowDown: Math.min(current + 1, last),
      ArrowUp: Math.max(current - 1, 0),
      Home: 0,
      End: last,
    };
    const next = move[event.key];
    if (next !== undefined && flat.length > 0) {
      event.preventDefault();
      setActive(next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = flat[current];
      if (choice) onChoose(choice.id);
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-10 bg-surface pb-1">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          />
          <input
            role="combobox"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={current >= 0 ? optionId(current) : undefined}
            aria-label={searchLabel}
            placeholder={searchLabel}
            autoComplete="off"
            spellCheck={false}
            // The list opened on request; the search field is where the person now types.
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className={cn(controlClass(), "h-11 pl-9")}
          />
        </div>
      </div>

      {flat.length === 0 && (
        <p role="status" className="px-2 pt-4 text-meta text-ink-2">
          No {noun} matches “{query.trim()}”.
        </p>
      )}

      <div role="listbox" id={`${id}-list`} aria-label={searchLabel}>
        {visible.map((section, s) => (
          <div
            key={section.title ?? s}
            role="group"
            aria-labelledby={section.title ? `${id}-group-${s}` : undefined}
          >
            {section.title && (
              <p
                id={`${id}-group-${s}`}
                className="px-2 pt-3 pb-1 text-micro font-semibold text-ink-2"
              >
                {section.title}
              </p>
            )}
            {section.choices.map((choice) => {
              const index = flat.indexOf(choice);
              const chosen = choice.id === selectedId;
              const described = [
                choice.detail && `${optionId(index)}-detail`,
                choice.aside && `${optionId(index)}-aside`,
                chosen && `${optionId(index)}-chosen`,
              ].filter(Boolean);
              return (
                <div
                  key={choice.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === current}
                  aria-labelledby={`${optionId(index)}-label`}
                  aria-describedby={described.length > 0 ? described.join(" ") : undefined}
                  onClick={() => onChoose(choice.id)}
                  onPointerMove={() => setActive(index)}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-2 py-1.5",
                    index === current && "bg-surface-hover/70",
                  )}
                >
                  <Glyph icon={choice.icon} tone={choice.tone} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span
                      id={`${optionId(index)}-label`}
                      className={cn(
                        "block truncate",
                        chosen ? "font-semibold text-navy" : "font-medium text-ink",
                      )}
                    >
                      {choice.label}
                    </span>
                    {choice.detail && (
                      <span
                        id={`${optionId(index)}-detail`}
                        className="block text-micro text-ink-2"
                      >
                        {choice.detail}
                      </span>
                    )}
                  </span>
                  {choice.aside && (
                    <span id={`${optionId(index)}-aside`} className="text-meta text-ink-2">
                      {choice.aside}
                    </span>
                  )}
                  {chosen ? (
                    <span id={`${optionId(index)}-chosen`} className="text-ocean">
                      <Check aria-hidden className="size-4" strokeWidth={2.25} />
                      <span className="sr-only">Current choice</span>
                    </span>
                  ) : (
                    <span className="w-4" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
