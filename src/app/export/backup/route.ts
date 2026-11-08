import { download } from "@/app/_server/download";
import { exportBackup } from "@/server/services/export-service";

/** GET /export/backup — everything, as a FinPilot backup file (JSON). */
export function GET() {
  return download((ctx) => exportBackup(ctx));
}
