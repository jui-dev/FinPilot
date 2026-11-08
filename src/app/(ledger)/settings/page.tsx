import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { DataControls } from "@/components/settings/data-controls";
import { YourData } from "@/components/settings/your-data";
import { PageHeader } from "@/components/ui/panel";
import { dataControlsEnabled } from "@/server/data-controls";

export const metadata: Metadata = { title: "Settings" };

/** Application settings. Categories are managed on their own page (/categories). */
export default async function SettingsPage() {
  const request = await getRequestContext();
  if (!request.ok) return null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" />
      <YourData />
      {dataControlsEnabled() && <DataControls />}
    </div>
  );
}
