import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { CategoriesManager } from "@/components/settings/categories-manager";
import { DataControls } from "@/components/settings/data-controls";
import { PageHeader } from "@/components/ui/panel";
import { dataControlsEnabled } from "@/server/data-controls";
import { getCategories, getCategoryReferenceCounts } from "@/server/services/setup-service";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx } = request;

  const [categories, uses] = await Promise.all([
    getCategories(ctx),
    getCategoryReferenceCounts(ctx),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Settings"
        description="Categories describe what money was for. Rename or archive them at any time."
      />
      <CategoriesManager
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          kind: category.kind,
          archived: category.archivedAt !== null,
          uses: uses.get(category.id) ?? 0,
        }))}
      />
      {dataControlsEnabled() && <DataControls />}
    </div>
  );
}
