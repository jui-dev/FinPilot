import { download } from "@/app/_server/download";
import { exportTransactionsCsv } from "@/server/services/export-service";

/** GET /export/transactions — every transaction, as a spreadsheet (CSV). */
export function GET() {
  return download((ctx, request) => exportTransactionsCsv(ctx, request.owner.baseCurrency));
}
