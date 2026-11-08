import { Download } from "lucide-react";

import { buttonClass } from "../ui/button";
import { Panel, PanelHeader } from "../ui/panel";
import { ControlRow } from "./control-row";

/** Where each file is served (src/app/export). */
export const BACKUP_HREF = "/export/backup";
export const TRANSACTIONS_CSV_HREF = "/export/transactions";

/**
 * Settings' Your data: take a copy of everything out of FinPilot. Downloading
 * changes nothing, so, unlike Data & demo, it is always offered. Each is a
 * plain link the browser saves, built fresh from the ledger on every click.
 */
export function YourData() {
  return (
    <Panel labelledBy="settings-your-data" className="overflow-hidden">
      <PanelHeader id="settings-your-data" title="Your data" />
      <ControlRow
        title="Download a backup"
        description="Everything in FinPilot, deleted entries and settings included, in one file. Keep it somewhere safe."
      >
        <DownloadLink href={BACKUP_HREF} label="Download backup" kind="JSON" />
      </ControlRow>
      <div className="border-t border-line-soft" />
      <ControlRow
        title="Export transactions"
        description="Every transaction, oldest first, as a spreadsheet you can open in Excel or Google Sheets."
      >
        <DownloadLink href={TRANSACTIONS_CSV_HREF} label="Export transactions" kind="CSV" />
      </ControlRow>
    </Panel>
  );
}

function DownloadLink({
  href,
  label,
  kind,
}: {
  readonly href: string;
  readonly label: string;
  readonly kind: string;
}) {
  return (
    <a href={href} download className={buttonClass("secondary", "md", "gap-2")}>
      <Download aria-hidden className="size-4" strokeWidth={1.75} />
      {label}
      <span className="rounded border border-line px-1 text-micro font-medium text-ink-2">
        {kind}
      </span>
    </a>
  );
}
